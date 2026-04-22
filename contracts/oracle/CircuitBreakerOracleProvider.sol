// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../error/Errors.sol";
import "../utils/Precision.sol";
import "./IOracleProvider.sol";
import "./OracleUtils.sol";

// @title CircuitBreakerOracleProvider
// @dev Dual-oracle wrapper. Fetches a price from two underlying providers
//      (primary + secondary, e.g. Pyth Lazer + Chainlink Data Streams),
//      reconciles them via a deviation check + timestamp skew check, and
//      returns a defensive ValidatedPrice (widened spread) if accepted.
//
//      Reverts the trade if either check fails.
//
//      The keeper packs `data` as:
//          abi.encode(bytes primaryData, bytes secondaryData)
//      which is unpacked here and routed to each underlying provider.
//
// @dev Per-token config in DataStore (governance via Config.sol):
//        Keys.circuitBreakerDeviationBpsKey(token)   — REQUIRED, bps (uint)
//        Keys.circuitBreakerTimestampSkewKey(token)  — OPTIONAL, seconds (uint), default 5
//
// @dev If `secondary` is ChainlinkDataStreamProvider, this wrapper's address
//      must be flagged via Keys.isDataStreamAuthorizedCallerKey(wrapper) = true
//      in DataStore before it can delegate there.
contract CircuitBreakerOracleProvider is IOracleProvider {
    uint256 private constant BPS_DIVISOR = 10_000;
    uint256 private constant DEFAULT_TIMESTAMP_SKEW_SECONDS = 5;

    DataStore public immutable dataStore;
    IOracleProvider public immutable primary;
    IOracleProvider public immutable secondary;

    constructor(
        DataStore _dataStore,
        IOracleProvider _primary,
        IOracleProvider _secondary
    ) {
        dataStore = _dataStore;
        primary = _primary;
        secondary = _secondary;
    }

    // Forward ETH so PythLazer verification fees can be covered when primary is PythLazer.
    receive() external payable {}

    function getOraclePrice(
        address token,
        bytes memory data
    ) external returns (OracleUtils.ValidatedPrice memory) {
        (bytes memory primaryData, bytes memory secondaryData) = abi.decode(
            data,
            (bytes, bytes)
        );

        OracleUtils.ValidatedPrice memory primaryPrice = primary.getOraclePrice(
            token,
            primaryData
        );
        OracleUtils.ValidatedPrice memory secondaryPrice = secondary.getOraclePrice(
            token,
            secondaryData
        );

        return _reconcilePrices(token, primaryPrice, secondaryPrice);
    }

    // @dev Reconciliation policy:
    //        1. Reject if timestamp skew between the two reports exceeds configured max.
    //        2. Reject if midpoint-to-midpoint deviation exceeds per-token bps threshold.
    //        3. Return the defensive (wider) pair: min of mins, max of maxes.
    //        4. Return the OLDER of the two timestamps, so downstream staleness checks
    //           catch a pair where one feed has drifted behind.
    function _reconcilePrices(
        address token,
        OracleUtils.ValidatedPrice memory primaryPrice,
        OracleUtils.ValidatedPrice memory secondaryPrice
    ) internal view returns (OracleUtils.ValidatedPrice memory) {
        uint256 skew = primaryPrice.timestamp > secondaryPrice.timestamp
            ? primaryPrice.timestamp - secondaryPrice.timestamp
            : secondaryPrice.timestamp - primaryPrice.timestamp;

        uint256 maxSkew = dataStore.getUint(Keys.circuitBreakerTimestampSkewKey(token));
        if (maxSkew == 0) {
            maxSkew = DEFAULT_TIMESTAMP_SKEW_SECONDS;
        }
        if (skew > maxSkew) {
            revert Errors.OracleCircuitBreakerTimestampSkew(
                token,
                primaryPrice.timestamp,
                secondaryPrice.timestamp,
                maxSkew
            );
        }

        uint256 maxBps = dataStore.getUint(Keys.circuitBreakerDeviationBpsKey(token));
        if (maxBps == 0) {
            revert Errors.EmptyCircuitBreakerDeviationBps(token);
        }

        uint256 primaryMid = (primaryPrice.min + primaryPrice.max) / 2;
        uint256 secondaryMid = (secondaryPrice.min + secondaryPrice.max) / 2;
        uint256 diff = primaryMid > secondaryMid
            ? primaryMid - secondaryMid
            : secondaryMid - primaryMid;
        uint256 deviationBps = (diff * BPS_DIVISOR) / primaryMid;
        if (deviationBps > maxBps) {
            revert Errors.OracleCircuitBreakerDeviation(
                token,
                primaryMid,
                secondaryMid,
                deviationBps,
                maxBps
            );
        }

        uint256 defensiveMin = primaryPrice.min < secondaryPrice.min
            ? primaryPrice.min
            : secondaryPrice.min;
        uint256 defensiveMax = primaryPrice.max > secondaryPrice.max
            ? primaryPrice.max
            : secondaryPrice.max;
        uint256 olderTimestamp = primaryPrice.timestamp < secondaryPrice.timestamp
            ? primaryPrice.timestamp
            : secondaryPrice.timestamp;

        return OracleUtils.ValidatedPrice({
            token: token,
            min: defensiveMin,
            max: defensiveMax,
            timestamp: olderTimestamp,
            provider: address(this)
        });
    }
}
