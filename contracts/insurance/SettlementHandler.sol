// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../exchange/BaseHandler.sol";
import "../market/MarketStoreUtils.sol";
import "../market/MarketUtils.sol";

import "./InsuranceFundUtils.sol";

// @title SettlementHandler
// @dev Permissioned keeper entrypoint for the insurance fund's epoch lifecycle.
// Today the only operation is per-market snapshot of pool USD (excluding
// unrealized PnL) at the start of each epoch — drawdown calculations downstream
// compare live state against this snapshot.
//
// Keeper expectation: call `snapshotEpoch(market, oracleParams)` once per market
// at each Friday 00:00 UTC boundary. The function is idempotent within an
// epoch — if `INSURANCE_FUND_EPOCH_LENGTH` seconds have not elapsed since the
// last snapshot it reverts with `InsuranceFundEpochNotYetElapsed`. First call
// on a market (epochStart == 0) is always allowed.
contract SettlementHandler is BaseHandler {
    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle
    ) BaseHandler(_roleStore, _dataStore, _eventEmitter, _oracle) {}

    // @param market the market to snapshot
    // @param oracleParams oracle prices payload — must include the market's
    //        indexToken / longToken / shortToken so getMarketPrices resolves
    function snapshotEpoch(
        address market,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external
        globalNonReentrant
        onlyOrderKeeper
        withOraclePrices(oracleParams)
    {
        uint256 epochStart = dataStore.getUint(Keys.insuranceFundEpochStartKey(market));
        uint256 epochLength = dataStore.getUint(Keys.INSURANCE_FUND_EPOCH_LENGTH);

        // Idempotency guard: allow if first-ever snapshot (epochStart == 0) or
        // if epoch length has elapsed since last snap. Skipping this would let
        // a keeper rewrite the snapshot mid-epoch and reset drawdown to zero,
        // defeating the LP protection.
        if (epochStart != 0 && block.timestamp < epochStart + epochLength) {
            revert Errors.InsuranceFundEpochNotYetElapsed(block.timestamp, epochStart, epochLength);
        }

        Market.Props memory marketProps = MarketStoreUtils.get(dataStore, market);
        MarketUtils.MarketPrices memory marketPrices = MarketUtils.getMarketPrices(oracle, marketProps);

        InsuranceFundUtils.snapshotEpoch(dataStore, eventEmitter, marketProps, marketPrices);
    }
}
