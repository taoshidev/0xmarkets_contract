// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "../data/DataStore.sol";

// @title LeverageLadderUtils
// @dev Library for resolving the per-market max leverage cap as a function of
// post-trade notional size. Returns type(uint256).max when no ladder is
// configured for a market, signalling "defer to market-level max leverage."
//
// This library is intentionally kept out of MarketUtils to avoid coupling with
// the legacy factor-based collateral semantics. It will be wired into
// position validation paths in a follow-up PR; until then it is unused and
// the behaviour of the system is unchanged.
library LeverageLadderUtils {
    // @dev returns the max allowed leverage for a given post-trade notional.
    //      Walks the configured tiers in ascending order and returns the
    //      maxLeverage of the first tier whose maxNotionalUsd is >= notionalUsd.
    // @param dataStore the DataStore to read the ladder from
    // @param market the market to read the ladder for
    // @param notionalUsd the post-trade notional (in USD, same precision as
    //        the values stored in the ladder)
    // @return the max allowed leverage, or type(uint256).max if no ladder
    //         is configured for the market
    function getMaxLeverageForNotional(
        DataStore dataStore,
        address market,
        uint256 notionalUsd
    ) internal view returns (uint256) {
        uint256 count = dataStore.getUint(Keys.leverageLadderTierCountKey(market));
        if (count == 0) {
            return type(uint256).max;
        }

        for (uint256 i = 0; i < count; i++) {
            uint256 maxNotional = dataStore.getUint(
                Keys.leverageLadderMaxNotionalKey(market, i)
            );
            if (notionalUsd <= maxNotional) {
                return dataStore.getUint(
                    Keys.leverageLadderMaxLeverageKey(market, i)
                );
            }
        }

        // Defensive fallback — unreachable when Config validates that the tail
        // tier's maxNotionalUsd == type(uint256).max.
        return dataStore.getUint(Keys.leverageLadderMaxLeverageKey(market, count - 1));
    }
}
