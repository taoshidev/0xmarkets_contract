// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/utils/math/SignedMath.sol";

import "../position/Position.sol";
import "../position/PositionUtils.sol";
import "../market/MarketUtils.sol";
import "../market/Market.sol";

// @title ReaderPricingUtils
library ReaderPricingUtils {
    using SignedMath for int256;
    using SafeCast for uint256;
    using SafeCast for int256;
    using Price for Price.Props;
    using Position for Position.Props;
    using Order for Order.Props;

    struct ExecutionPriceResult {
        int256 priceImpactUsd;
        uint256 priceImpactDiffUsd;
        uint256 executionPrice;
    }

    struct PositionInfo {
        Position.Props position;
        PositionPricingUtils.PositionFees fees;
        ExecutionPriceResult executionPriceResult;
        int256 basePnlUsd;
        int256 pnlAfterPriceImpactUsd;
    }

    struct GetPositionInfoCache {
        Market.Props market;
        Price.Props collateralTokenPrice;
        uint256 pendingBorrowingFeeUsd;
        int256 latestLongTokenFundingAmountPerSize;
        int256 latestShortTokenFundingAmountPerSize;
    }
    
    function getExecutionPrice(
        DataStore dataStore,
        Market.Props memory market,
        Price.Props memory indexTokenPrice,
        uint256 positionSizeInUsd,
        uint256 positionSizeInTokens,
        int256 sizeDeltaUsd,
        bool isLong
    ) external view returns (ExecutionPriceResult memory) {
        PositionUtils.UpdatePositionParams memory params;

        params.contracts.dataStore = dataStore;
        params.market = market;

        params.order.setSizeDeltaUsd(sizeDeltaUsd.abs());
        params.order.setIsLong(isLong);

        bool isIncrease = sizeDeltaUsd > 0;
        bool shouldExecutionPriceBeSmaller = isIncrease ? isLong : !isLong;
        params.order.setAcceptablePrice(shouldExecutionPriceBeSmaller ? type(uint256).max : 0);

        params.position.setSizeInUsd(positionSizeInUsd);
        params.position.setSizeInTokens(positionSizeInTokens);
        params.position.setIsLong(isLong);

        ExecutionPriceResult memory result;

        if (sizeDeltaUsd > 0) {
            (result.priceImpactUsd, /* priceImpactAmount */, /* sizeDeltaInTokens */, result.executionPrice) = PositionUtils.getExecutionPriceForIncrease(
                params,
                indexTokenPrice
            );
        } else {
             (result.priceImpactUsd, result.priceImpactDiffUsd, result.executionPrice) = PositionUtils.getExecutionPriceForDecrease(
                params,
                indexTokenPrice
            );
        }

        return result;
    }
}
