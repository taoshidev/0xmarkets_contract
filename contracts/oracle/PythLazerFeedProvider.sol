// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/utils/Strings.sol";
import {PythLazer} from "pyth-lazer-sdk/PythLazer.sol";
import {PythLazerLib} from "pyth-lazer-sdk/PythLazerLib.sol";
import {PythLazerStructs} from "pyth-lazer-sdk/PythLazerStructs.sol";

import "../chain/Chain.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../error/Errors.sol";
import "../utils/Precision.sol";
import "./IOracleProvider.sol";
import "./OracleUtils.sol";

contract PythLazerFeedProvider is IOracleProvider {
    DataStore public immutable dataStore;
    PythLazer public immutable pythLazer;

    constructor(DataStore _dataStore, address pythLazerFeedVerifier) {
        dataStore = _dataStore;
        pythLazer = PythLazer(pythLazerFeedVerifier);
    }

    // Accept ETH to cover Pyth verification fees
    receive() external payable {}

    function getOraclePrice(
        address token,
        bytes memory data
    ) external returns (OracleUtils.ValidatedPrice memory) {
        uint32 feedId = uint32(dataStore.getUint(Keys.pythLazerFeedIdKey(token)));
        if (feedId == 0) revert Errors.EmptyPythLazerFeedId(token);

        uint256 feedMultiplier = dataStore.getUint(Keys.pythLazerFeedMultiplierKey(token));
        if (feedMultiplier == 0) revert Errors.EmptyPythLazerFeedMultiplier(token);

        bool inverted = dataStore.getBool(Keys.pythLazerFeedInvertedKey(token));

        // Verify signature via verifyUpdate (v0.1.1 compatible), then parse locally
        uint256 fee = pythLazer.verification_fee();
        (bytes memory payload, ) = pythLazer.verifyUpdate{value: fee}(data);
        PythLazerStructs.Update memory parsedUpdate = PythLazerLib.parseUpdateFromPayload(payload);

        for (uint256 i = 0; i < parsedUpdate.feeds.length; i++) {
            if (parsedUpdate.feeds[i].feedId == feedId) {
                return _buildPrice(token, parsedUpdate.feeds[i], feedMultiplier, inverted, parsedUpdate.timestamp);
            }
        }

        revert Errors.EmptyPythLazerFeedData(token);
    }

    function _buildPrice(
        address token,
        PythLazerStructs.Feed memory feed,
        uint256 feedMultiplier,
        bool inverted,
        uint64 timestamp
    ) internal view returns (OracleUtils.ValidatedPrice memory) {
        int64 askPrice = PythLazerLib.getBestAskPrice(feed);
        if (askPrice < 0) revert Errors.InvalidFeedPrice(token, int256(askPrice));

        int64 bidPrice = PythLazerLib.getBestBidPrice(feed);
        if (bidPrice < 0) revert Errors.InvalidFeedPrice(token, int256(bidPrice));

        uint256 minPrice = Precision.mulDiv(
            uint256(uint64(bidPrice)),
            feedMultiplier,
            Precision.FLOAT_PRECISION
        );
        uint256 maxPrice = Precision.mulDiv(
            uint256(uint64(askPrice)),
            feedMultiplier,
            Precision.FLOAT_PRECISION
        );

        if (inverted) {
            uint256 temp = minPrice;
            minPrice = Precision.mulDiv(Precision.FLOAT_PRECISION, Precision.FLOAT_PRECISION, maxPrice);
            maxPrice = Precision.mulDiv(Precision.FLOAT_PRECISION, Precision.FLOAT_PRECISION, temp);
        }

        return OracleUtils.ValidatedPrice({
            token: token,
            min: minPrice,
            max: maxPrice,
            timestamp: timestamp / 1000000,
            provider: address(this)
        });
    }
}
