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

    mapping(address => OracleUtils.ValidatedPrice) public storedPrices;

    constructor(DataStore _dataStore, address pythLazerFeedVerifier) {
        dataStore = _dataStore;
        pythLazer = PythLazer(pythLazerFeedVerifier);
    }

    function getOraclePrice(
        address token,
        bytes memory /* data */
    ) external view returns (OracleUtils.ValidatedPrice memory) {
        OracleUtils.ValidatedPrice memory storedPrice = storedPrices[token];

        uint256 maxAge = dataStore.getUint(Keys.MAX_ORACLE_PRICE_AGE);
        if (maxAge > 0 && Chain.currentTimestamp() - storedPrice.timestamp >= maxAge) {
            revert Errors.MaxPriceAgeExceeded(storedPrice.timestamp, Chain.currentTimestamp());
        }

        return storedPrice;
    }

    function getStoredPrice(address token) external view returns (bool, OracleUtils.ValidatedPrice memory) {
        OracleUtils.ValidatedPrice memory storedPrice = storedPrices[token];

        bool ok = false;
        if (storedPrice.timestamp > 0) {
            ok = true;
        }

        return (ok, storedPrice);
    }

    function updatePrice(address token, bytes calldata rawUpdate) external payable {
        uint32 feedId = uint32(dataStore.getUint(Keys.pythLazerFeedIdKey(token)));
        if (feedId == 0) revert Errors.EmptyPythLazerFeedId(token);

        uint256 feedMultiplier = dataStore.getUint(Keys.pythLazerFeedMultiplierKey(token));
        if (feedMultiplier == 0) revert Errors.EmptyPythLazerFeedMultiplier(token);

        bool inverted = dataStore.getBool(Keys.pythLazerFeedInvertedKey(token));

        (, PythLazerStructs.Update memory parsedUpdate) = pythLazer.verifyAndParseUpdate{
            value: pythLazer.verification_fee()
        }(rawUpdate);

        if (parsedUpdate.timestamp < storedPrices[token].timestamp) {
            revert Errors.StaleOraclePrice(token, parsedUpdate.timestamp, storedPrices[token].timestamp);
        }

        for (uint256 i = 0; i < parsedUpdate.feeds.length; i++) {
            PythLazerStructs.Feed memory feed = parsedUpdate.feeds[i];

            if (feed.feedId == feedId) {
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

                storedPrices[token] = OracleUtils.ValidatedPrice({
                    token: token,
                    min: minPrice,
                    max: maxPrice,
                    timestamp: parsedUpdate.timestamp,
                    provider: address(this)
                });

                return;
            }
        }

        revert Errors.EmptyPythLazerFeedData(token);
    }
}
