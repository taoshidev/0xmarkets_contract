// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/utils/math/SignedMath.sol";

import "../data/Keys.sol";

import "../position/Position.sol";
import "../market/MarketUtils.sol";
import "../market/Market.sol";

library ReaderDepositUtils {
    using SignedMath for int256;
    using SafeCast for uint256;
    using SafeCast for int256;
    using Price for Price.Props;
    using Position for Position.Props;
    using Order for Order.Props;

    struct GetDepositAmountOutForSingleTokenParams {
        DataStore dataStore;
        Market.Props market;
        MarketUtils.MarketPrices prices;
        address tokenIn;
        Price.Props tokenInPrice;
        address tokenOut;
        Price.Props tokenOutPrice;
        uint256 amount;
        int256 priceImpactUsd;
        address uiFeeReceiver;
    }

    function getDepositAmountOut(
        DataStore dataStore,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        uint256 longTokenAmount,
        uint256 shortTokenAmount,
        address uiFeeReceiver
    ) external view returns (uint256) {
        uint256 longTokenUsd = longTokenAmount * prices.longTokenPrice.midPrice();
        uint256 shortTokenUsd = shortTokenAmount * prices.shortTokenPrice.midPrice();
        int256 priceImpactUsd = 0;

        uint256 mintAmount;

        mintAmount += getDepositAmountOutForSingleToken(
            GetDepositAmountOutForSingleTokenParams(
                dataStore,
                market,
                prices,
                market.longToken,
                prices.longTokenPrice,
                market.shortToken,
                prices.shortTokenPrice,
                longTokenAmount,
                Precision.mulDiv(priceImpactUsd, longTokenUsd, longTokenUsd + shortTokenUsd),
                uiFeeReceiver
            )
        );

        mintAmount += getDepositAmountOutForSingleToken(
            GetDepositAmountOutForSingleTokenParams(
                dataStore,
                market,
                prices,
                market.shortToken,
                prices.shortTokenPrice,
                market.longToken,
                prices.longTokenPrice,
                shortTokenAmount,
                Precision.mulDiv(priceImpactUsd, shortTokenUsd, longTokenUsd + shortTokenUsd),
                uiFeeReceiver
            )
        );

        return mintAmount;
    }

    function getDepositAmountOutForSingleToken(
        GetDepositAmountOutForSingleTokenParams memory params
    ) public view returns (uint256) {
        uint256 depositFeeRate = params.dataStore.getUint(Keys.DEPOSIT_FEE_FACTOR);
        uint256 feeAmount = (params.amount * depositFeeRate) / Precision.FLOAT_PRECISION;
        uint256 amountAfterFees = params.amount - feeAmount;

        uint256 mintAmount;
        uint256 amountIn = amountAfterFees;

        MarketPoolValueInfo.Props memory poolValueInfo = MarketUtils.getPoolValueInfo(
            params.dataStore,
            params.market,
            params.prices.indexTokenPrice,
            params.prices.longTokenPrice,
            params.prices.shortTokenPrice,
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            true
        );

        if (poolValueInfo.poolValue < 0) {
            revert Errors.InvalidPoolValueForDeposit(poolValueInfo.poolValue);
        }

        uint256 poolValue = poolValueInfo.poolValue.toUint256();

        uint256 marketTokensSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(params.market.marketToken)));

        if (poolValueInfo.poolValue == 0 && marketTokensSupply > 0) {
            revert Errors.InvalidPoolValueForDeposit(poolValueInfo.poolValue);
        }

        if (params.priceImpactUsd > 0 && marketTokensSupply == 0) {
            params.priceImpactUsd = 0;
        }

        mintAmount += MarketUtils.usdToMarketTokenAmount(
            amountIn * params.tokenInPrice.min,
            poolValue,
            marketTokensSupply
        );

        return mintAmount;
    }
}
