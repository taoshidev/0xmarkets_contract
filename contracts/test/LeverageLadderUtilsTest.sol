// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../position/LeverageLadderUtils.sol";
import "../data/DataStore.sol";

contract LeverageLadderUtilsTest {
    function getMaxLeverageForNotional(
        DataStore dataStore,
        address market,
        uint256 notionalUsd
    ) external view returns (uint256) {
        return LeverageLadderUtils.getMaxLeverageForNotional(dataStore, market, notionalUsd);
    }
}
