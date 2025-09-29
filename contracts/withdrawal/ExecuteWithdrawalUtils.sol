// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";

import "./WithdrawalVault.sol";
import "./WithdrawalStoreUtils.sol";
import "./WithdrawalEventUtils.sol";

import "../fee/FeeUtils.sol";
import "../oracle/Oracle.sol";
import "../position/PositionUtils.sol";

import "../gas/GasUtils.sol";
import "../callback/CallbackUtils.sol";

import "../utils/Array.sol";

library ExecuteWithdrawalUtils {
    using SafeCast for uint256;
    using SafeCast for int256;
    using Array for uint256[];
    using Price for Price.Props;
    using Withdrawal for Withdrawal.Props;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    struct ExecuteWithdrawalParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        WithdrawalVault withdrawalVault;
        Oracle oracle;
        bytes32 key;
        address keeper;
        uint256 startingGas;
    }

    struct ExecuteWithdrawalCache {
        uint256 requestExpirationTime;
        uint256 maxOracleTimestamp;
        uint256 marketTokensBalance;
        uint256 oraclePriceCount;
        Market.Props market;
        MarketUtils.MarketPrices prices;
        ExecuteWithdrawalResult result;
    }

    struct _ExecuteWithdrawalCache {
        uint256 longTokenOutputAmount;
        uint256 shortTokenOutputAmount;
        uint256 longTokenProtocolFee;
        uint256 shortTokenProtocolFee;
        uint256 longTokenUiFee;
        uint256 shortTokenUiFee;
        uint256 longTokenPoolAmountDelta;
        uint256 shortTokenPoolAmountDelta;
    }

    struct ExecuteWithdrawalResult {
        address outputToken;
        uint256 outputAmount;
        address secondaryOutputToken;
        uint256 secondaryOutputAmount;
    }

    /**
     * Executes a withdrawal on the market.
     *
     * @param params The parameters for executing the withdrawal.
     */
    function executeWithdrawal(
        ExecuteWithdrawalParams memory params,
        Withdrawal.Props memory withdrawal
    ) external returns (ExecuteWithdrawalResult memory) {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        params.startingGas -= gasleft() / 63;

        WithdrawalStoreUtils.remove(params.dataStore, params.key, withdrawal.account());

        if (withdrawal.account() == address(0)) {
            revert Errors.EmptyWithdrawal();
        }
        if (withdrawal.marketTokenAmount() == 0) {
            revert Errors.EmptyWithdrawalAmount();
        }

        if (params.oracle.minTimestamp() < withdrawal.updatedAtTime()) {
            revert Errors.OracleTimestampsAreSmallerThanRequired(
                params.oracle.minTimestamp(),
                withdrawal.updatedAtTime()
            );
        }

        ExecuteWithdrawalCache memory cache;

        cache.requestExpirationTime = params.dataStore.getUint(Keys.REQUEST_EXPIRATION_TIME);
        cache.maxOracleTimestamp = params.oracle.maxTimestamp();

        if (cache.maxOracleTimestamp > withdrawal.updatedAtTime() + cache.requestExpirationTime) {
            revert Errors.OracleTimestampsAreLargerThanRequestExpirationTime(
                cache.maxOracleTimestamp,
                withdrawal.updatedAtTime(),
                cache.requestExpirationTime
            );
        }

        MarketUtils.distributePositionImpactPool(params.dataStore, params.eventEmitter, withdrawal.market());

        cache.market = MarketUtils.getEnabledMarket(params.dataStore, withdrawal.market());
        cache.prices = MarketUtils.getMarketPrices(params.oracle, cache.market);

        PositionUtils.updateFundingAndBorrowingState(params.dataStore, params.eventEmitter, cache.market, cache.prices);

        cache.marketTokensBalance = MarketToken(payable(withdrawal.market())).balanceOf(
            address(params.withdrawalVault)
        );
        if (cache.marketTokensBalance < withdrawal.marketTokenAmount()) {
            revert Errors.InsufficientMarketTokens(cache.marketTokensBalance, withdrawal.marketTokenAmount());
        }

        cache.result = _executeWithdrawal(params, withdrawal, cache.market, cache.prices);

        WithdrawalEventUtils.emitWithdrawalExecuted(
            params.eventEmitter,
            params.key,
            withdrawal.account(),
            cache.result.outputToken,
            cache.result.outputAmount,
            cache.result.secondaryOutputToken,
            cache.result.secondaryOutputAmount
        );

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "outputToken", cache.result.outputToken);
        eventData.addressItems.setItem(1, "secondaryOutputToken", cache.result.secondaryOutputToken);
        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "outputAmount", cache.result.outputAmount);
        eventData.uintItems.setItem(1, "secondaryOutputAmount", cache.result.secondaryOutputAmount);
        CallbackUtils.afterWithdrawalExecution(params.key, withdrawal, eventData);

        cache.oraclePriceCount = GasUtils.estimateWithdrawalOraclePriceCount(0);

        GasUtils.payExecutionFee(
            params.dataStore,
            params.eventEmitter,
            params.withdrawalVault,
            params.key,
            withdrawal.callbackContract(),
            withdrawal.executionFee(),
            params.startingGas,
            cache.oraclePriceCount,
            params.keeper,
            withdrawal.receiver()
        );

        return cache.result;
    }

    /**
     * @dev executes a withdrawal.
     * @param params ExecuteWithdrawalParams.
     * @param withdrawal The withdrawal to execute.
     */
    function _executeWithdrawal(
        ExecuteWithdrawalParams memory params,
        Withdrawal.Props memory withdrawal,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices
    ) internal returns (ExecuteWithdrawalResult memory) {
        _ExecuteWithdrawalCache memory cache;

        (cache.longTokenOutputAmount, cache.shortTokenOutputAmount) = _getOutputAmounts(
            params,
            market,
            prices,
            withdrawal.marketTokenAmount()
        );

        cache.longTokenProtocolFee = Precision.applyFactor(
            cache.longTokenOutputAmount, 
            params.dataStore.getUint(Keys.WITHDRAWAL_FEE_FACTOR)
        );
        cache.longTokenUiFee = Precision.applyFactor(
            cache.longTokenOutputAmount,
            MarketUtils.getUiFeeFactor(params.dataStore, withdrawal.uiFeeReceiver())
        );

        FeeUtils.incrementClaimableFeeAmount(
            params.dataStore,
            params.eventEmitter,
            market.marketToken,
            market.longToken,
            cache.longTokenProtocolFee,
            Keys.WITHDRAWAL_FEE_TYPE
        );

        FeeUtils.incrementClaimableUiFeeAmount(
            params.dataStore,
            params.eventEmitter,
            withdrawal.uiFeeReceiver(),
            market.marketToken,
            market.longToken,
            cache.longTokenUiFee,
            Keys.UI_WITHDRAWAL_FEE_TYPE
        );

        cache.shortTokenProtocolFee = Precision.applyFactor(
            cache.shortTokenOutputAmount, 
            params.dataStore.getUint(Keys.WITHDRAWAL_FEE_FACTOR)
        );
        cache.shortTokenUiFee = Precision.applyFactor(
            cache.shortTokenOutputAmount,
            MarketUtils.getUiFeeFactor(params.dataStore, withdrawal.uiFeeReceiver())
        );

        FeeUtils.incrementClaimableFeeAmount(
            params.dataStore,
            params.eventEmitter,
            market.marketToken,
            market.shortToken,
            cache.shortTokenProtocolFee,
            Keys.WITHDRAWAL_FEE_TYPE
        );

        FeeUtils.incrementClaimableUiFeeAmount(
            params.dataStore,
            params.eventEmitter,
            withdrawal.uiFeeReceiver(),
            market.marketToken,
            market.shortToken,
            cache.shortTokenUiFee,
            Keys.UI_WITHDRAWAL_FEE_TYPE
        );

        // the pool will be reduced by the outputAmount minus the fees for the pool
        cache.longTokenPoolAmountDelta = cache.longTokenOutputAmount - cache.longTokenProtocolFee;
        cache.longTokenOutputAmount = cache.longTokenOutputAmount - cache.longTokenProtocolFee;

        cache.shortTokenPoolAmountDelta = cache.shortTokenOutputAmount - cache.shortTokenProtocolFee;
        cache.shortTokenOutputAmount = cache.shortTokenOutputAmount - cache.shortTokenProtocolFee;

        // it is rare but possible for withdrawals to be blocked because pending borrowing fees
        // have not yet been deducted from position collateral and credited to the poolAmount value
        MarketUtils.applyDeltaToPoolAmount(
            params.dataStore,
            params.eventEmitter,
            market,
            market.longToken,
            -cache.longTokenPoolAmountDelta.toInt256()
        );

        MarketUtils.applyDeltaToPoolAmount(
            params.dataStore,
            params.eventEmitter,
            market,
            market.shortToken,
            -cache.shortTokenPoolAmountDelta.toInt256()
        );

        MarketUtils.validateReserve(params.dataStore, market, prices, true);

        MarketUtils.validateReserve(params.dataStore, market, prices, false);

        MarketUtils.validateMaxPnl(
            params.dataStore,
            market,
            prices,
            Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
            Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS
        );

        MarketToken(payable(market.marketToken)).burn(address(params.withdrawalVault), withdrawal.marketTokenAmount());

        params.withdrawalVault.syncTokenBalance(market.marketToken);

        ExecuteWithdrawalResult memory result;
        result.outputToken = market.longToken; // USDC
        result.outputAmount = cache.longTokenOutputAmount;
        result.secondaryOutputToken = market.shortToken; // USDC 
        result.secondaryOutputAmount = cache.shortTokenOutputAmount;

        // If both tokens are the same (USDC-only market), consolidate into a single transfer
        if (market.longToken == market.shortToken) {
            uint256 consolidatedAmount = result.outputAmount + result.secondaryOutputAmount;
            result.outputAmount = consolidatedAmount;
            result.secondaryOutputAmount = 0;

            MarketToken(payable(market.marketToken)).transferOut(
                market.longToken,
                withdrawal.receiver(),
                consolidatedAmount
            );
        } else {
            // Transfer both amounts to receiver from the MarketToken which holds pool funds
            MarketToken(payable(market.marketToken)).transferOut(
                market.longToken,
                withdrawal.receiver(),
                result.outputAmount
            );

            MarketToken(payable(market.marketToken)).transferOut(
                market.longToken,
                withdrawal.receiver(),
                result.secondaryOutputAmount
            );
        }

        // if the native token was transferred to the receiver in a swap
        // it may be possible to invoke external contracts before the validations
        // are called
        MarketUtils.validateMarketTokenBalance(params.dataStore, market);

        MarketPoolValueInfo.Props memory poolValueInfo = MarketUtils.getPoolValueInfo(
            params.dataStore,
            market,
            prices.indexTokenPrice,
            prices.longTokenPrice,
            prices.shortTokenPrice,
            Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
            false
        );

        uint256 marketTokensSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(market.marketToken)));

        MarketEventUtils.emitMarketPoolValueUpdated(
            params.eventEmitter,
            keccak256(abi.encode("WITHDRAWAL")),
            params.key,
            market.marketToken,
            poolValueInfo,
            marketTokensSupply
        );

        return result;
    }

    function _getOutputAmounts(
        ExecuteWithdrawalParams memory params,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        uint256 marketTokenAmount
    ) internal returns (uint256, uint256) {
        // the max pnl factor for withdrawals should be the lower of the max pnl factor values
        // which means that pnl would be capped to a smaller amount and the pool
        // value would be higher even if there is a large pnl
        // this should be okay since MarketUtils.validateMaxPnl is called after the withdrawal
        // which ensures that the max pnl factor for withdrawals was not exceeded
        MarketPoolValueInfo.Props memory poolValueInfo = MarketUtils.getPoolValueInfo(
            params.dataStore,
            market,
            params.oracle.getPrimaryPrice(market.indexToken),
            prices.longTokenPrice,
            prices.shortTokenPrice,
            Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
            false
        );

        if (poolValueInfo.poolValue <= 0) {
            revert Errors.InvalidPoolValueForWithdrawal(poolValueInfo.poolValue);
        }

        uint256 poolValue = poolValueInfo.poolValue.toUint256();
        uint256 marketTokensSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(market.marketToken)));

        MarketEventUtils.emitMarketPoolValueInfo(
            params.eventEmitter,
            params.key,
            market.marketToken,
            poolValueInfo,
            marketTokensSupply
        );

        uint256 longTokenPoolAmount = MarketUtils.getPoolAmount(params.dataStore, market, market.longToken);
        uint256 shortTokenPoolAmount = MarketUtils.getPoolAmount(params.dataStore, market, market.shortToken);

        uint256 longTokenPoolUsd = longTokenPoolAmount * prices.longTokenPrice.max;
        uint256 shortTokenPoolUsd = shortTokenPoolAmount * prices.shortTokenPrice.max;

        uint256 totalPoolUsd = longTokenPoolUsd + shortTokenPoolUsd;

        uint256 marketTokensUsd = MarketUtils.marketTokenAmountToUsd(marketTokenAmount, poolValue, marketTokensSupply);

        uint256 longTokenOutputUsd = Precision.mulDiv(marketTokensUsd, longTokenPoolUsd, totalPoolUsd);
        uint256 shortTokenOutputUsd = Precision.mulDiv(marketTokensUsd, shortTokenPoolUsd, totalPoolUsd);

        return (longTokenOutputUsd / prices.longTokenPrice.max, shortTokenOutputUsd / prices.shortTokenPrice.max);
    }
}
