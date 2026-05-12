// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/utils/math/SafeCast.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../event/EventEmitter.sol";
import "../market/Market.sol";
import "../market/MarketToken.sol";
import "../market/MarketUtils.sol";
import "../price/Price.sol";
import "../utils/Precision.sol";

import "./InsuranceVault.sol";
import "./InsuranceFundEventUtils.sol";

// @title InsuranceFundUtils
// @dev Per-market insurance reserve logic. Three responsibilities:
//   1. Collect a configurable slice of liquidation/position fees into the
//      InsuranceVault (deposit).
//   2. Inject capital from the vault back into MarketToken when realized
//      pool drawdown exceeds the per-market trigger threshold
//      (attemptInjectPool).
//   3. Snapshot the per-market pool USD value at epoch boundaries so
//      drawdown can be computed against a stable baseline (snapshotEpoch).
//
// The vault is a singleton; per-market and per-token segregation is
// bookkeeping in DataStore. Callers must already hold the CONTROLLER role
// on MarketToken and the InsuranceVault — the protocol handlers do.
library InsuranceFundUtils {
    using SafeCast for int256;
    using SafeCast for uint256;

    using Price for Price.Props;

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getBalance(DataStore dataStore, address market, address token) internal view returns (uint256) {
        return dataStore.getUint(Keys.insuranceFundBalanceKey(market, token));
    }

    // @dev Computes the current realized drawdown fraction for a market.
    //
    // Returns (0, currentValue, epochValue) when the fund is **disabled**
    // for that market, which is any of:
    //   - first epoch (epochValue == 0, snapshotEpoch never ran)
    //   - stale snapshot (block.timestamp - epochStart > MAX_EPOCH_AGE)
    //   - pool currently at or above the epoch snapshot (no drawdown)
    //
    // Uses minimize=false for the pool-value lookup so the snapshot and
    // current measurement use the same price-pick rule. Both use the LP-
    // conservative "minimize" pickPrice so a stressed-LP read is always
    // the larger number (better protection).
    function getDrawdownFraction(
        DataStore dataStore,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices
    ) internal view returns (uint256 drawdownFraction, uint256 currentPoolValueUsd, uint256 epochPoolValueUsd) {
        int256 cur = MarketUtils.getPoolValueExcludingUnrealizedPnl(dataStore, market, prices, false);
        currentPoolValueUsd = cur < 0 ? 0 : uint256(cur);

        epochPoolValueUsd = dataStore.getUint(Keys.insuranceFundEpochPoolValueKey(market.marketToken));
        if (epochPoolValueUsd == 0) {
            return (0, currentPoolValueUsd, epochPoolValueUsd);
        }

        uint256 epochStart = dataStore.getUint(Keys.insuranceFundEpochStartKey(market.marketToken));
        uint256 maxAge = dataStore.getUint(Keys.INSURANCE_FUND_MAX_EPOCH_AGE);
        // maxAge == 0 disables the stale check (treat as no upper bound).
        // A keeper-supplied maxAge of e.g. 8 days bounds how long a missed
        // Friday snapshot can poison subsequent drawdown calculations.
        if (maxAge > 0 && epochStart != 0 && block.timestamp - epochStart > maxAge) {
            return (0, currentPoolValueUsd, epochPoolValueUsd);
        }

        if (currentPoolValueUsd >= epochPoolValueUsd) {
            return (0, currentPoolValueUsd, epochPoolValueUsd);
        }

        uint256 drawdownUsd = epochPoolValueUsd - currentPoolValueUsd;
        // 1e30-scaled fraction. epochPoolValueUsd is non-zero by the check above.
        drawdownFraction = (drawdownUsd * Precision.FLOAT_PRECISION) / epochPoolValueUsd;
    }

    // ---------------------------------------------------------------------
    // Collection
    // ---------------------------------------------------------------------

    // @dev Moves `amount` of `token` from MarketToken into the InsuranceVault
    // and increments the per (market, token) reserve bookkeeping.
    //
    // Idempotent on zero (no-op rather than revert) so callers can pass the
    // computed slice unconditionally without an outer check.
    function deposit(
        DataStore dataStore,
        EventEmitter eventEmitter,
        InsuranceVault vault,
        address market,
        address token,
        bytes32 orderKey,
        uint256 amount
    ) internal returns (uint256 newBalance) {
        if (amount == 0) {
            return dataStore.getUint(Keys.insuranceFundBalanceKey(market, token));
        }

        MarketToken(payable(market)).transferOut(token, address(vault), amount);
        // recordTransferIn returns the delta vs. previously-tracked balance.
        // We ignore the return value because the bookkeeping increment uses
        // the requested `amount`; if a non-standard token (fee-on-transfer)
        // delivered less, the invariant
        //   vault.tokenBalances(token) >= sum(reserve buckets)
        // would fail, which is the correct posture — we don't support such
        // tokens as pnl/collateral in any market.
        vault.recordTransferIn(token);

        newBalance = dataStore.incrementUint(Keys.insuranceFundBalanceKey(market, token), amount);

        InsuranceFundEventUtils.emitInsuranceFundDeposit(
            eventEmitter,
            market,
            token,
            orderKey,
            amount,
            newBalance
        );
    }

    // @dev Governance-initiated reserve top-up from treasury.
    //
    // Two-phase: external caller must first transfer `amount` of `token`
    // into the vault, then call this to record the transfer and increment
    // the bucket. Mirrors the protocol's "send then record" pattern (see
    // ExchangeRouter deposits).
    function topUp(
        DataStore dataStore,
        EventEmitter eventEmitter,
        InsuranceVault vault,
        address market,
        address token,
        address depositor,
        uint256 amount
    ) internal returns (uint256 newBalance) {
        if (amount == 0) {
            return dataStore.getUint(Keys.insuranceFundBalanceKey(market, token));
        }

        // recordTransferIn reads balanceOf and subtracts the prior cached
        // value; reverts implicitly if the depositor under-transferred.
        uint256 received = vault.recordTransferIn(token);
        require(received >= amount, "InsuranceFundUtils: under-funded topUp");

        newBalance = dataStore.incrementUint(Keys.insuranceFundBalanceKey(market, token), amount);

        InsuranceFundEventUtils.emitInsuranceFundManualDeposit(
            eventEmitter,
            market,
            token,
            depositor,
            amount,
            newBalance
        );
    }

    // ---------------------------------------------------------------------
    // Injection
    // ---------------------------------------------------------------------

    // @dev If realized drawdown exceeds the per-market trigger factor,
    // transfers `pnlToken` from the InsuranceVault into MarketToken and
    // credits the pool via applyDeltaToPoolAmount until drawdown returns
    // to threshold (or the reserve bucket is drained).
    //
    // Returns the number of tokens actually injected (0 if no trigger or
    // empty reserve). Never reverts on insufficient reserve — emits
    // InsuranceFundShortfall and proceeds.
    //
    // Wiring: this is intended to be called once at the end of
    // DecreasePositionCollateralUtils.processCollateral, after all
    // applyDeltaToPoolAmount branches have settled. ADL and liquidation
    // paths flow through the same `processCollateral`, so they pick this
    // up automatically.
    function attemptInjectPool(
        DataStore dataStore,
        EventEmitter eventEmitter,
        InsuranceVault vault,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        address pnlToken,
        bytes32 orderKey
    ) internal returns (uint256 injectedAmount) {
        uint256 triggerFactor = dataStore.getUint(Keys.insuranceFundDrawdownTriggerFactorKey(market.marketToken));
        // type(uint256).max is the "off" sentinel; default value of an unset
        // key is 0, which would semantically mean "inject on any drawdown",
        // so the unset-by-default state is the wrong direction. Operators
        // must explicitly set type(uint256).max in Config to mark a market
        // as not-yet-onboarded. (Spec §4.1 lists this as the default; the
        // deploy script must initialize accordingly.)
        if (triggerFactor == type(uint256).max) {
            return 0;
        }

        uint256 drawdownBefore;
        uint256 requestedTokens;
        {
            (uint256 _drawdownBefore, uint256 currentValue, uint256 epochValue) = getDrawdownFraction(dataStore, market, prices);
            if (_drawdownBefore <= triggerFactor) {
                return 0;
            }
            drawdownBefore = _drawdownBefore;
            requestedTokens = _computeRequestedInjection(
                market,
                prices,
                pnlToken,
                currentValue,
                epochValue,
                triggerFactor
            );
            if (requestedTokens == 0) {
                return 0;
            }
        }

        uint256 reserveBalance = dataStore.getUint(Keys.insuranceFundBalanceKey(market.marketToken, pnlToken));
        if (reserveBalance == 0) {
            InsuranceFundEventUtils.emitInsuranceFundShortfall(
                eventEmitter,
                market.marketToken,
                pnlToken,
                orderKey,
                requestedTokens,
                0
            );
            return 0;
        }

        injectedAmount = requestedTokens > reserveBalance ? reserveBalance : requestedTokens;

        // Physical move vault → marketToken. The vault's _afterTransferOut
        // hook (StrictBank) re-syncs its tokenBalances mapping.
        vault.transferOut(pnlToken, market.marketToken, injectedAmount);

        // Pool accounting credit. Also tweaks virtual swap inventory as a
        // side-effect inside applyDeltaToPoolAmount — see review §1.6.
        uint256 newPoolAmount = MarketUtils.applyDeltaToPoolAmount(
            dataStore,
            eventEmitter,
            market,
            pnlToken,
            injectedAmount.toInt256()
        );

        // Decrement the reserve bucket.
        uint256 newReserveBalance = dataStore.applyDeltaToUint(
            Keys.insuranceFundBalanceKey(market.marketToken, pnlToken),
            -injectedAmount.toInt256(),
            "Invalid state, negative insurance reserve"
        );

        // Recompute drawdown post-injection for the event payload. Cheaper
        // alternatives exist (subtract injectedAmount*price/epochValue from
        // drawdownBefore) but a fresh read is robust against any concurrent
        // pool-amount changes within this tx.
        (uint256 drawdownAfter, , ) = getDrawdownFraction(dataStore, market, prices);

        InsuranceFundEventUtils.emitInsuranceFundInjection(
            eventEmitter,
            market.marketToken,
            pnlToken,
            orderKey,
            injectedAmount,
            newPoolAmount,
            newReserveBalance,
            drawdownBefore,
            drawdownAfter
        );

        if (injectedAmount < requestedTokens) {
            InsuranceFundEventUtils.emitInsuranceFundShortfall(
                eventEmitter,
                market.marketToken,
                pnlToken,
                orderKey,
                requestedTokens,
                injectedAmount
            );
        }
    }

    // @dev Compute the number of pnlToken units needed to bring drawdown
    // back to threshold. Extracted from attemptInjectPool so the
    // intermediate locals (target, missing, pnlTokenPrice) don't pin slots
    // on the caller's stack — stack-too-deep otherwise.
    function _computeRequestedInjection(
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        address pnlToken,
        uint256 currentValue,
        uint256 epochValue,
        uint256 triggerFactor
    ) private pure returns (uint256) {
        uint256 targetCurrentValue = Precision.applyFactor(
            epochValue,
            Precision.FLOAT_PRECISION - triggerFactor
        );
        // drawdownBefore > triggerFactor (caller checked) ⇒ currentValue < targetCurrentValue.
        uint256 missingUsd = targetCurrentValue - currentValue;

        // Use pnlTokenPrice.min so we slightly over-inject (LP-favorable rounding).
        Price.Props memory pnlTokenPrice = MarketUtils.getCachedTokenPrice(pnlToken, market, prices);
        return missingUsd / pnlTokenPrice.min;
    }

    // ---------------------------------------------------------------------
    // Epoch lifecycle
    // ---------------------------------------------------------------------

    // @dev Snapshots the current pool USD (excluding unrealized PnL) as the
    // baseline for the next epoch's drawdown calculation, and stamps the
    // epoch-start timestamp.
    //
    // Idempotency / freshness is the caller's concern — SettlementHandler
    // enforces an epoch-length gap. This function unconditionally writes.
    function snapshotEpoch(
        DataStore dataStore,
        EventEmitter eventEmitter,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices
    ) internal returns (uint256 epochValue) {
        // minimize=false matches getDrawdownFraction's call so both sides
        // use the same price-pick rule. (Snapshot pick must match current
        // pick or drawdown will mis-fire.)
        int256 poolValue = MarketUtils.getPoolValueExcludingUnrealizedPnl(dataStore, market, prices, false);
        epochValue = poolValue < 0 ? 0 : uint256(poolValue);

        dataStore.setUint(Keys.insuranceFundEpochPoolValueKey(market.marketToken), epochValue);
        dataStore.setUint(Keys.insuranceFundEpochStartKey(market.marketToken), block.timestamp);

        InsuranceFundEventUtils.emitInsuranceFundEpochReset(
            eventEmitter,
            market.marketToken,
            epochValue,
            block.timestamp
        );
    }
}
