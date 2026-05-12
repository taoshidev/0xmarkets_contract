// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../pricing/PositionPricingUtils.sol";

// @title PositionPricingUtilsTest
// @dev Thin external wrapper exposing the internal pricing helpers so unit
// tests can assert on the struct fields the insurance fund extension adds.
contract PositionPricingUtilsTest {
    function getLiquidationFees(
        DataStore dataStore,
        address market,
        uint256 sizeInUsd,
        Price.Props memory collateralTokenPrice
    ) external view returns (PositionPricingUtils.PositionLiquidationFees memory) {
        return PositionPricingUtils.getLiquidationFees(dataStore, market, sizeInUsd, collateralTokenPrice);
    }

    function getPositionFeesAfterReferral(
        DataStore dataStore,
        IReferralStorage referralStorage,
        Price.Props memory collateralTokenPrice,
        bool forPositiveImpact,
        address account,
        address market,
        uint256 sizeDeltaUsd
    ) external view returns (PositionPricingUtils.PositionFees memory) {
        return
            PositionPricingUtils.getPositionFeesAfterReferral(
                dataStore,
                referralStorage,
                collateralTokenPrice,
                forPositiveImpact,
                account,
                market,
                sizeDeltaUsd
            );
    }
}
