// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../chain/Chain.sol";
import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../utils/Precision.sol";
import "./MarketEventUtils.sol";
import "./MarketToken.sol";
import "./MarketUtils.sol";

library MarketCollateralUtils {
    // @dev apply a delta to the collateral sum
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the market to apply to
    // @param collateralToken the collateralToken to apply to
    // @param isLong whether to apply to the long or short side
    // @param delta the delta amount
    function applyDeltaToCollateralSum(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address collateralToken,
        bool isLong,
        int256 delta
    ) internal returns (uint256) {
        uint256 nextValue = dataStore.applyDeltaToUint(
            Keys.collateralSumKey(market, collateralToken, isLong),
            delta,
            "Invalid state: negative collateralSum"
        );

        MarketEventUtils.emitCollateralSumUpdated(eventEmitter, market, collateralToken, isLong, delta, nextValue);

        return nextValue;
    }

    // @dev claim collateral
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the market to claim for
    // @param token the token to claim
    // @param timeKey the time key
    // @param account the account to claim for
    // @param receiver the receiver to send the amount to
    function claimCollateral(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        uint256 timeKey,
        address account,
        address receiver
    ) internal returns (uint256) {
        uint256 claimableAmount = dataStore.getUint(Keys.claimableCollateralAmountKey(market, token, timeKey, account));

        uint256 claimableFactor;

        {
            uint256 claimableFactorForTime = dataStore.getUint(
                Keys.claimableCollateralFactorKey(market, token, timeKey)
            );
            uint256 claimableFactorForAccount = dataStore.getUint(
                Keys.claimableCollateralFactorKey(market, token, timeKey, account)
            );
            claimableFactor = claimableFactorForTime > claimableFactorForAccount
                ? claimableFactorForTime
                : claimableFactorForAccount;
        }

        if (claimableFactor > Precision.FLOAT_PRECISION) {
            revert Errors.InvalidClaimableFactor(claimableFactor);
        }

        uint256 claimedAmount = dataStore.getUint(Keys.claimedCollateralAmountKey(market, token, timeKey, account));

        uint256 adjustedClaimableAmount = Precision.applyFactor(claimableAmount, claimableFactor);
        if (adjustedClaimableAmount <= claimedAmount) {
            revert Errors.CollateralAlreadyClaimed(adjustedClaimableAmount, claimedAmount);
        }

        uint256 amountToBeClaimed = adjustedClaimableAmount - claimedAmount;

        dataStore.setUint(Keys.claimedCollateralAmountKey(market, token, timeKey, account), adjustedClaimableAmount);

        uint256 nextPoolValue = dataStore.decrementUint(
            Keys.claimableCollateralAmountKey(market, token),
            amountToBeClaimed
        );

        MarketToken(payable(market)).transferOut(token, receiver, amountToBeClaimed);

        MarketUtils.validateMarketTokenBalance(dataStore, market);

        MarketEventUtils.emitCollateralClaimed(
            eventEmitter,
            market,
            token,
            timeKey,
            account,
            receiver,
            amountToBeClaimed,
            nextPoolValue
        );

        return amountToBeClaimed;
    }

    // @dev increment the claimable collateral amount
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the market to increment the claimable collateral for
    // @param token the claimable token
    // @param account the account to increment the claimable collateral for
    // @param delta the amount to increment
    function incrementClaimableCollateralAmount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        address account,
        uint256 delta
    ) internal {
        uint256 divisor = dataStore.getUint(Keys.CLAIMABLE_COLLATERAL_TIME_DIVISOR);
        uint256 timeKey = Chain.currentTimestamp() / divisor;

        uint256 nextValue = dataStore.incrementUint(
            Keys.claimableCollateralAmountKey(market, token, timeKey, account),
            delta
        );

        uint256 nextPoolValue = dataStore.incrementUint(Keys.claimableCollateralAmountKey(market, token), delta);

        MarketEventUtils.emitClaimableCollateralUpdated(
            eventEmitter,
            market,
            token,
            timeKey,
            account,
            delta,
            nextValue,
            nextPoolValue
        );
    }
}
