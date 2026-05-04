// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/utils/math/SafeCast.sol";

import "../utils/Precision.sol";
import "../utils/Calc.sol";
import "../data/DataStore.sol";
import "../market/MarketUtils.sol";
import "../pricing/PositionPricingUtils.sol";
import "../order/BaseOrderUtils.sol";
import "../error/Errors.sol";

import "./Position.sol";
import "./PositionUtils.sol";

// @title PositionExecutionPriceUtils
// @dev Library hosting the getExecutionPriceForIncrease / getExecutionPriceForDecrease
// functions. Lifted from PositionUtils to keep that library under the EVM
// 24,576-byte size limit. Pure pricing logic — no behavior change.
library PositionExecutionPriceUtils {
    using SafeCast for uint256;
    using SafeCast for int256;
    using Price for Price.Props;
    using Position for Position.Props;
    using Order for Order.Props;

    struct GetExecutionPriceForDecreaseCache {
        int256 priceImpactUsd;
        uint256 priceImpactDiffUsd;
        uint256 executionPrice;
    }

    // returns priceImpactUsd, priceImpactAmount, sizeDeltaInTokens, executionPrice
    function getExecutionPriceForIncrease(
        PositionUtils.UpdatePositionParams memory params,
        Price.Props memory indexTokenPrice
    ) external view returns (int256, int256, uint256, uint256) {
        // note that the executionPrice is not validated against the order.acceptablePrice value
        // if the sizeDeltaUsd is zero
        // for limit orders the order.triggerPrice should still have been validated
        if (params.order.sizeDeltaUsd() == 0) {
            // increase order:
            //     - long: use the larger price
            //     - short: use the smaller price
            return (0, 0, 0, indexTokenPrice.pickPrice(params.position.isLong()));
        }

        int256 priceImpactUsd = PositionPricingUtils.getPriceImpactUsd(
            PositionPricingUtils.GetPriceImpactUsdParams(
                params.contracts.dataStore,
                params.market,
                params.order.sizeDeltaUsd().toInt256(),
                params.order.isLong()
            )
        );

        // cap priceImpactUsd based on the amount available in the position impact pool
        priceImpactUsd = MarketUtils.getCappedPositionImpactUsd(
            params.contracts.dataStore,
            params.market.marketToken,
            indexTokenPrice,
            priceImpactUsd,
            params.order.sizeDeltaUsd()
        );

        // for long positions
        //
        // if price impact is positive, the sizeDeltaInTokens would be increased by the priceImpactAmount
        // the priceImpactAmount should be minimized
        //
        // if price impact is negative, the sizeDeltaInTokens would be decreased by the priceImpactAmount
        // the priceImpactAmount should be maximized

        // for short positions
        //
        // if price impact is positive, the sizeDeltaInTokens would be decreased by the priceImpactAmount
        // the priceImpactAmount should be minimized
        //
        // if price impact is negative, the sizeDeltaInTokens would be increased by the priceImpactAmount
        // the priceImpactAmount should be maximized

        int256 priceImpactAmount;

        if (priceImpactUsd > 0) {
            // use indexTokenPrice.max and round down to minimize the priceImpactAmount
            priceImpactAmount = priceImpactUsd / indexTokenPrice.max.toInt256();
        } else {
            // use indexTokenPrice.min and round up to maximize the priceImpactAmount
            priceImpactAmount = Calc.roundUpMagnitudeDivision(priceImpactUsd, indexTokenPrice.min);
        }

        uint256 baseSizeDeltaInTokens;

        if (params.position.isLong()) {
            // round the number of tokens for long positions down
            baseSizeDeltaInTokens = params.order.sizeDeltaUsd() / indexTokenPrice.max;
        } else {
            // round the number of tokens for short positions up
            baseSizeDeltaInTokens = Calc.roundUpDivision(params.order.sizeDeltaUsd(), indexTokenPrice.min);
        }

        int256 sizeDeltaInTokens;
        if (params.position.isLong()) {
            sizeDeltaInTokens = baseSizeDeltaInTokens.toInt256() + priceImpactAmount;
        } else {
            sizeDeltaInTokens = baseSizeDeltaInTokens.toInt256() - priceImpactAmount;
        }

        if (sizeDeltaInTokens < 0) {
            revert Errors.PriceImpactLargerThanOrderSize(priceImpactUsd, params.order.sizeDeltaUsd());
        }

        // using increase of long positions as an example
        // if price is $2000, sizeDeltaUsd is $5000, priceImpactUsd is -$1000
        // priceImpactAmount = -1000 / 2000 = -0.5
        // baseSizeDeltaInTokens = 5000 / 2000 = 2.5
        // sizeDeltaInTokens = 2.5 - 0.5 = 2
        // executionPrice = 5000 / 2 = $2500
        uint256 executionPrice = BaseOrderUtils.getExecutionPriceForIncrease(
            params.order.sizeDeltaUsd(),
            sizeDeltaInTokens.toUint256(),
            params.order.acceptablePrice(),
            params.position.isLong()
        );

        return (priceImpactUsd, priceImpactAmount, sizeDeltaInTokens.toUint256(), executionPrice);
    }

    // returns priceImpactUsd, priceImpactDiffUsd, executionPrice
    function getExecutionPriceForDecrease(
        PositionUtils.UpdatePositionParams memory params,
        Price.Props memory indexTokenPrice
    ) external view returns (int256, uint256, uint256) {
        uint256 sizeDeltaUsd = params.order.sizeDeltaUsd();

        // note that the executionPrice is not validated against the order.acceptablePrice value
        // if the sizeDeltaUsd is zero
        // for limit orders the order.triggerPrice should still have been validated
        if (sizeDeltaUsd == 0) {
            // decrease order:
            //     - long: use the smaller price
            //     - short: use the larger price
            return (0, 0, indexTokenPrice.pickPrice(!params.position.isLong()));
        }

        GetExecutionPriceForDecreaseCache memory cache;

        cache.priceImpactUsd = PositionPricingUtils.getPriceImpactUsd(
            PositionPricingUtils.GetPriceImpactUsdParams(
                params.contracts.dataStore,
                params.market,
                -sizeDeltaUsd.toInt256(),
                params.order.isLong()
            )
        );

        // cap priceImpactUsd based on the amount available in the position impact pool
        cache.priceImpactUsd = MarketUtils.getCappedPositionImpactUsd(
            params.contracts.dataStore,
            params.market.marketToken,
            indexTokenPrice,
            cache.priceImpactUsd,
            sizeDeltaUsd
        );

        if (cache.priceImpactUsd < 0) {
            uint256 maxPriceImpactFactor = MarketUtils.getMaxPositionImpactFactor(
                params.contracts.dataStore,
                params.market.marketToken,
                false
            );

            // convert the max price impact to the min negative value
            // e.g. if sizeDeltaUsd is 10,000 and maxPriceImpactFactor is 2%
            // then minPriceImpactUsd = -200
            int256 minPriceImpactUsd = -Precision.applyFactor(sizeDeltaUsd, maxPriceImpactFactor).toInt256();

            // cap priceImpactUsd to the min negative value and store the difference in priceImpactDiffUsd
            // e.g. if priceImpactUsd is -500 and minPriceImpactUsd is -200
            // then set priceImpactDiffUsd to -200 - -500 = 300
            // set priceImpactUsd to -200
            if (cache.priceImpactUsd < minPriceImpactUsd) {
                cache.priceImpactDiffUsd = (minPriceImpactUsd - cache.priceImpactUsd).toUint256();
                cache.priceImpactUsd = minPriceImpactUsd;
            }
        }

        // the executionPrice is calculated after the price impact is capped
        // so the output amount directly received by the user may not match
        // the executionPrice, the difference would be stored as a
        // claimable amount
        cache.executionPrice = BaseOrderUtils.getExecutionPriceForDecrease(
            indexTokenPrice,
            params.position.sizeInUsd(),
            params.position.sizeInTokens(),
            sizeDeltaUsd,
            cache.priceImpactUsd,
            params.order.acceptablePrice(),
            params.position.isLong()
        );

        return (cache.priceImpactUsd, cache.priceImpactDiffUsd, cache.executionPrice);
    }
}
