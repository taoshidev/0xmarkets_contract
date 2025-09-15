// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";

import "./DepositVault.sol";
import "./DepositStoreUtils.sol";
import "./DepositEventUtils.sol";

import "../oracle/Oracle.sol";
import "../position/PositionUtils.sol";

import "../gas/GasUtils.sol";
import "../callback/CallbackUtils.sol";
import "../fee/FeeUtils.sol";
import "../utils/Array.sol";

// @title DepositUtils
// @dev Library for deposit functions, to help with the depositing of liquidity
// into a market in return for market tokens
library ExecuteDepositUtils {
    using SafeCast for uint256;
    using SafeCast for int256;
    using Array for uint256[];

    using Price for Price.Props;
    using Deposit for Deposit.Props;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    // @dev ExecuteDepositParams struct used in executeDeposit to avoid stack
    // too deep errors
    struct ExecuteDepositParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        DepositVault depositVault;
        Oracle oracle;
        bytes32 key;
        address keeper;
        uint256 startingGas;
    }

    // @dev _ExecuteDepositParams struct used in executeDeposit to avoid stack
    // too deep errors
    //
    // @param market the market to deposit into
    // @param account the depositing account
    // @param receiver the account to send the market tokens to
    // @param uiFeeReceiver the ui fee receiver account
    // @param tokenIn the token to deposit, either the market.longToken or
    // market.shortToken
    // @param tokenOut the other token, if tokenIn is market.longToken then
    // tokenOut is market.shortToken and vice versa
    // @param tokenInPrice price of tokenIn
    // @param tokenOutPrice price of tokenOut
    // @param amount amount of tokenIn
    // @param priceImpactUsd price impact in USD
    struct _ExecuteDepositParams {
        Market.Props market;
        address account;
        address receiver;
        address uiFeeReceiver;
        address tokenIn;
        address tokenOut;
        Price.Props tokenInPrice;
        Price.Props tokenOutPrice;
        uint256 amount;
        int256 priceImpactUsd;
    }

    struct ExecuteDepositCache {
        uint256 requestExpirationTime;
        uint256 maxOracleTimestamp;
        Market.Props market;
        MarketUtils.MarketPrices prices;
        uint256 longTokenAmount;
        uint256 shortTokenAmount;
        uint256 longTokenUsd;
        uint256 shortTokenUsd;
        uint256 receivedMarketTokens;
        int256 priceImpactUsd;
        uint256 marketTokensSupply;
        EventUtils.EventLogData callbackEventData;
    }

    address public constant RECEIVER_FOR_FIRST_DEPOSIT = address(1);

    // @dev executes a deposit
    // @param params ExecuteDepositParams
    function executeDeposit(ExecuteDepositParams memory params, Deposit.Props memory deposit) external returns (uint256 receivedMarketTokens) {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        params.startingGas -= gasleft() / 63;

        DepositStoreUtils.remove(params.dataStore, params.key, deposit.account());


        if (deposit.account() == address(0)) {
            revert Errors.EmptyDeposit();
        }

        if (params.oracle.minTimestamp() < deposit.updatedAtTime()) {
            revert Errors.OracleTimestampsAreSmallerThanRequired(
                params.oracle.minTimestamp(),
                deposit.updatedAtTime()
            );
        }

        ExecuteDepositCache memory cache;
        cache.requestExpirationTime = params.dataStore.getUint(Keys.REQUEST_EXPIRATION_TIME);
        cache.maxOracleTimestamp = params.oracle.maxTimestamp();

        if (cache.maxOracleTimestamp > deposit.updatedAtTime() + cache.requestExpirationTime) {
            revert Errors.OracleTimestampsAreLargerThanRequestExpirationTime(
                cache.maxOracleTimestamp,
                deposit.updatedAtTime(),
                cache.requestExpirationTime
            );
        }

        cache.market = MarketUtils.getEnabledMarket(params.dataStore, deposit.market());

        _validateFirstDeposit(params, deposit, cache.market);

        cache.prices = MarketUtils.getMarketPrices(params.oracle, cache.market);

        MarketUtils.distributePositionImpactPool(
            params.dataStore,
            params.eventEmitter,
            cache.market.marketToken
        );

        PositionUtils.updateFundingAndBorrowingState(
            params.dataStore,
            params.eventEmitter,
            cache.market,
            cache.prices
        );

        // deposits should improve the pool state but it should be checked if
        // the max pnl factor for deposits is exceeded as this would lead to the
        // price of the market token decreasing below a target minimum percentage
        // due to pnl
        // note that this is just a validation for deposits, there is no actual
        // minimum price for a market token
        MarketUtils.validateMaxPnl(
            params.dataStore,
            cache.market,
            cache.prices,
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS
        );

        cache.longTokenAmount = deposit.initialLongTokenAmount();
        cache.shortTokenAmount = deposit.initialShortTokenAmount();

        params.depositVault.transferOut(
            deposit.initialLongToken(),
            cache.market.marketToken,
            cache.longTokenAmount
        );

        params.depositVault.transferOut(
            deposit.initialShortToken(),
            cache.market.marketToken, 
            cache.shortTokenAmount
        );

        cache.longTokenUsd = cache.longTokenAmount * cache.prices.longTokenPrice.midPrice();
        cache.shortTokenUsd = cache.shortTokenAmount * cache.prices.shortTokenPrice.midPrice();

        cache.priceImpactUsd = 0;

        if (cache.longTokenAmount > 0) {
            _ExecuteDepositParams memory _params = _ExecuteDepositParams(
                cache.market,
                deposit.account(),
                deposit.receiver(),
                deposit.uiFeeReceiver(),
                cache.market.longToken,
                cache.market.shortToken,
                cache.prices.longTokenPrice,
                cache.prices.shortTokenPrice,
                cache.longTokenAmount,
                Precision.mulDiv(cache.priceImpactUsd, cache.longTokenUsd, cache.longTokenUsd + cache.shortTokenUsd)
            );

            cache.receivedMarketTokens += _executeDeposit(params, _params);
        }

        if (cache.shortTokenAmount > 0) {
            _ExecuteDepositParams memory _params = _ExecuteDepositParams(
                cache.market,
                deposit.account(),
                deposit.receiver(),
                deposit.uiFeeReceiver(),
                cache.market.shortToken,
                cache.market.longToken,
                cache.prices.shortTokenPrice,
                cache.prices.longTokenPrice,
                cache.shortTokenAmount,
                Precision.mulDiv(cache.priceImpactUsd, cache.shortTokenUsd, cache.longTokenUsd + cache.shortTokenUsd)
            );

            cache.receivedMarketTokens += _executeDeposit(params, _params);
        }

        if (cache.receivedMarketTokens < deposit.minMarketTokens()) {
            revert Errors.MinMarketTokens(cache.receivedMarketTokens, deposit.minMarketTokens());
        }

        // validate that internal state changes are correct before calling
        // external callbacks
        MarketUtils.validateMarketTokenBalance(params.dataStore, cache.market);

        DepositEventUtils.emitDepositExecuted(
            params.eventEmitter,
            params.key,
            deposit.account(),
            cache.longTokenAmount,
            cache.shortTokenAmount,
            cache.receivedMarketTokens
        );

        MarketPoolValueInfo.Props memory poolValueInfo = MarketUtils.getPoolValueInfo(
            params.dataStore,
            cache.market,
            cache.prices.indexTokenPrice,
            cache.prices.longTokenPrice,
            cache.prices.shortTokenPrice,
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            true
        );

        cache.marketTokensSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(cache.market.marketToken)));

        MarketEventUtils.emitMarketPoolValueUpdated(
            params.eventEmitter,
            keccak256(abi.encode("DEPOSIT")),
            params.key,
            cache.market.marketToken,
            poolValueInfo,
            cache.marketTokensSupply
        );

        cache.callbackEventData.uintItems.initItems(1);
        cache.callbackEventData.uintItems.setItem(0, "receivedMarketTokens", cache.receivedMarketTokens);
        CallbackUtils.afterDepositExecution(params.key, deposit, cache.callbackEventData);

        GasUtils.payExecutionFee(
            params.dataStore,
            params.eventEmitter,
            params.depositVault,
            params.key,
            deposit.callbackContract(),
            deposit.executionFee(),
            params.startingGas,
            GasUtils.estimateDepositOraclePriceCount(0),
            params.keeper,
            deposit.receiver()
        );

        return cache.receivedMarketTokens;
    }

    // @dev executes a deposit
    // @param params ExecuteDepositParams
    // @param _params _ExecuteDepositParams
    function _executeDeposit(ExecuteDepositParams memory params, _ExecuteDepositParams memory _params) internal returns (uint256) {
        // for markets where longToken == shortToken, the price impact factor should be set to zero
        // in which case, the priceImpactUsd would always equal zero
        uint256 depositFeeAmount = Precision.applyFactor(_params.amount, params.dataStore.getUint(Keys.DEPOSIT_FEE_FACTOR));

        uint256 uiFeeAmount = Precision.applyFactor(_params.amount, MarketUtils.getUiFeeFactor(params.dataStore, _params.uiFeeReceiver));        

        FeeUtils.incrementClaimableFeeAmount(
            params.dataStore,
            params.eventEmitter,
            _params.market.marketToken,
            _params.tokenIn,
            depositFeeAmount,
            Keys.DEPOSIT_FEE_TYPE
        );

        FeeUtils.incrementClaimableUiFeeAmount(
            params.dataStore,
            params.eventEmitter,
            _params.uiFeeReceiver,
            _params.market.marketToken,
            _params.tokenIn,
            uiFeeAmount,
            Keys.UI_DEPOSIT_FEE_TYPE
        );

        uint256 mintAmount;

        MarketPoolValueInfo.Props memory poolValueInfo = MarketUtils.getPoolValueInfo(
            params.dataStore,
            _params.market,
            params.oracle.getPrimaryPrice(_params.market.indexToken),
            _params.tokenIn == _params.market.longToken ? _params.tokenInPrice : _params.tokenOutPrice,
            _params.tokenIn == _params.market.shortToken ? _params.tokenInPrice : _params.tokenOutPrice,
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            true
        );

        if (poolValueInfo.poolValue < 0) {
            revert Errors.InvalidPoolValueForDeposit(poolValueInfo.poolValue);
        }

        uint256 poolValue = poolValueInfo.poolValue.toUint256();

        uint256 marketTokensSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(_params.market.marketToken)));

        if (poolValueInfo.poolValue == 0 && marketTokensSupply > 0) {
            revert Errors.InvalidPoolValueForDeposit(poolValueInfo.poolValue);
        }

        MarketEventUtils.emitMarketPoolValueInfo(
            params.eventEmitter,
            params.key,
            _params.market.marketToken,
            poolValueInfo,
            marketTokensSupply
        );

        // the poolValue and marketTokensSupply is cached for the mintAmount calculation below
        // so the effect of any positive price impact on the poolValue and marketTokensSupply
        // would not be accounted for
        //
        // for most cases, this should not be an issue, since the poolValue and marketTokensSupply
        // should have been proportionately increased
        //
        // e.g. if the poolValue is $100 and marketTokensSupply is 100, and there is a positive price impact
        // of $10, the poolValue should have increased by $10 and the marketTokensSupply should have been increased by 10
        //
        // there is a case where this may be an issue which is when all tokens are withdrawn from an existing market
        // and the marketTokensSupply is reset to zero, but the poolValue is not entirely zero
        // the case where this happens should be very rare and during withdrawal the poolValue should be close to zero
        //
        // however, in case this occurs, the usdToMarketTokenAmount will mint an additional number of market tokens
        // proportional to the existing poolValue
        //
        // since the poolValue and marketTokensSupply is cached, this could occur once during positive price impact
        // and again when calculating the mintAmount
        //
        // to avoid this, set the priceImpactUsd to be zero for this case
        _params.priceImpactUsd = 0;

        mintAmount += MarketUtils.usdToMarketTokenAmount(
            depositFeeAmount + uiFeeAmount + _params.amount * _params.tokenInPrice.min,
            poolValue,
            marketTokensSupply
        );

        MarketUtils.applyDeltaToPoolAmount(
            params.dataStore,
            params.eventEmitter,
            _params.market,
            _params.tokenIn,
            (depositFeeAmount + uiFeeAmount + _params.amount).toInt256()
        );

        MarketUtils.validatePoolUsdForDeposit(
            params.dataStore,
            _params.market,
            _params.tokenIn,
            _params.tokenInPrice.max
        );

        MarketUtils.validatePoolAmount(
            params.dataStore,
            _params.market,
            _params.tokenIn
        );

        MarketToken(payable(_params.market.marketToken)).mint(_params.receiver, mintAmount);

        return mintAmount;
    }

    // this method validates that a specified minimum number of market tokens are locked
    // this can be used to help ensure a minimum amount of liquidity for a market
    // this also helps to prevent manipulation of the market token price by the first depositor
    // since it may be possible to deposit a small amount of tokens on the first deposit
    // to cause a high market token price due to rounding of the amount of tokens minted
    function _validateFirstDeposit(
        ExecuteDepositParams memory params,
        Deposit.Props memory deposit,
        Market.Props memory market
    ) internal view {
        uint256 initialMarketTokensSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(market.marketToken)));

        // return if this is not the first deposit
        if (initialMarketTokensSupply != 0) { return; }

        uint256 minMarketTokens = params.dataStore.getUint(Keys.minMarketTokensForFirstDepositKey(market.marketToken));

        // return if there is no minMarketTokens requirement
        if (minMarketTokens == 0) { return; }

        if (deposit.receiver() != RECEIVER_FOR_FIRST_DEPOSIT) {
            revert Errors.InvalidReceiverForFirstDeposit(deposit.receiver(), RECEIVER_FOR_FIRST_DEPOSIT);
        }

        if (deposit.minMarketTokens() < minMarketTokens) {
            revert Errors.InvalidMinMarketTokensForFirstDeposit(deposit.minMarketTokens(), minMarketTokens);
        }
    }
}
