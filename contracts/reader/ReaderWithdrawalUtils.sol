// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/utils/math/SignedMath.sol";

import "../data/Keys.sol";

import "../position/Position.sol";
import "../market/MarketUtils.sol";
import "../market/Market.sol";

library ReaderWithdrawalUtils {
    using SignedMath for int256;
    using SafeCast for uint256;
    using SafeCast for int256;
    using Price for Price.Props;
    using Position for Position.Props;
    using Order for Order.Props;

    struct GetWithdrawalAmountOutCache {
        uint256 poolValue;
        uint256 marketTokensSupply;

        uint256 longTokenPoolAmount;
        uint256 shortTokenPoolAmount;

        uint256 longTokenPoolUsd;
        uint256 shortTokenPoolUsd;

        uint256 totalPoolUsd;

        uint256 marketTokensUsd;

        uint256 longTokenOutputUsd;
        uint256 shortTokenOutputUsd;

        uint256 longTokenOutputAmount;
        uint256 shortTokenOutputAmount;
    }

    function getWithdrawalAmountOut(
        DataStore dataStore,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        uint256 marketTokenAmount,
        address uiFeeReceiver
    ) external view returns (uint256, uint256) {
        GetWithdrawalAmountOutCache memory cache;

        MarketPoolValueInfo.Props memory poolValueInfo = MarketUtils.getPoolValueInfo(
            dataStore,
            market,
            prices.indexTokenPrice,
            prices.longTokenPrice,
            prices.shortTokenPrice,
            Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
            false
        );

        if (poolValueInfo.poolValue <= 0) {
            revert Errors.InvalidPoolValueForWithdrawal(poolValueInfo.poolValue);
        }

        cache.poolValue = poolValueInfo.poolValue.toUint256();
        cache.marketTokensSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(market.marketToken)));

        cache.longTokenPoolAmount = MarketUtils.getPoolAmount(dataStore, market, market.longToken);
        cache.shortTokenPoolAmount = MarketUtils.getPoolAmount(dataStore, market, market.shortToken);

        cache.longTokenPoolUsd = cache.longTokenPoolAmount * prices.longTokenPrice.max;
        cache.shortTokenPoolUsd = cache.shortTokenPoolAmount * prices.shortTokenPrice.max;

        cache.totalPoolUsd = cache.longTokenPoolUsd + cache.shortTokenPoolUsd;

        cache.marketTokensUsd = MarketUtils.marketTokenAmountToUsd(marketTokenAmount, cache.poolValue, cache.marketTokensSupply);

        cache.longTokenOutputUsd = Precision.mulDiv(cache.marketTokensUsd, cache.longTokenPoolUsd, cache.totalPoolUsd);
        cache.shortTokenOutputUsd = Precision.mulDiv(cache.marketTokensUsd, cache.shortTokenPoolUsd, cache.totalPoolUsd);

        cache.longTokenOutputAmount = cache.longTokenOutputUsd / prices.longTokenPrice.max;
        cache.shortTokenOutputAmount = cache.shortTokenOutputUsd / prices.shortTokenPrice.max;

        uint256 totalOutputAmount = cache.longTokenOutputAmount + cache.shortTokenOutputAmount;
    
        // Calculate withdrawal fee
        uint256 withdrawalFeeAmount = Precision.applyFactor(
            totalOutputAmount,
            dataStore.getUint(Keys.WITHDRAWAL_FEE_FACTOR)
        );
        
        // Calculate UI fee
        uint256 uiFeeAmount = Precision.applyFactor(
            totalOutputAmount,
            MarketUtils.getUiFeeFactor(dataStore, uiFeeReceiver)
        );
        
        // Calculate total amount after fees
        uint256 totalFees = withdrawalFeeAmount + uiFeeAmount;
        uint256 totalAmountAfterFees = totalOutputAmount - totalFees;
        
        uint256 longTokenAfterFees = Precision.mulDiv(
            totalAmountAfterFees, 
            cache.longTokenOutputAmount, 
            totalOutputAmount
        );
        uint256 shortTokenAfterFees = totalAmountAfterFees - longTokenAfterFees;
        
        return (longTokenAfterFees, shortTokenAfterFees);
    }
}
