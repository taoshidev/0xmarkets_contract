// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../error/Errors.sol";
import "../utils/Precision.sol";
import "./IOracleProvider.sol";
import "./OracleUtils.sol";

// @title CircuitBreakerOracleProvider
// @dev Hybrid dual-oracle wrapper. Three modes per-call, selected by which payloads
//      the keeper provides:
//
//        1. BOTH feeds available (circuit breaker):
//           Deviation + timestamp-skew checks; revert if either fails.
//           On pass, return a defensive price (wider min/max, older timestamp).
//
//        2. ONE feed available (graceful degradation):
//           Return that feed's price directly, emit OracleDegradedMode.
//           ONLY allowed when Keys.allowSingleOracleFallbackKey(token) is true.
//           Otherwise reverts with OracleSingleFallbackDisabled.
//
//        3. NEITHER feed available:
//           Reverts with NoOracleData.
//
//      Keeper signals "unavailable" by sending an empty bytes payload (length 0)
//      on that side. The keeper packs `data` as:
//          abi.encode(bytes primaryData, bytes secondaryData)
//
// @dev Per-token config in DataStore (governance via Config.sol):
//        Keys.circuitBreakerDeviationBpsKey(token)   — REQUIRED when both feeds present
//        Keys.circuitBreakerTimestampSkewKey(token)  — OPTIONAL, seconds, default 5
//        Keys.allowSingleOracleFallbackKey(token)    — OPTIONAL, bool, default false
//                                                      (must be true to allow mode 2)
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

    // @dev Emitted whenever the wrapper serves a price based on a single underlying
    //      feed because the other was unavailable. Wire this up to monitoring — if it
    //      fires frequently the market is effectively running single-oracle.
    event OracleDegradedMode(address indexed token, bool usedSecondary);

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

        bool primaryAvailable = primaryData.length > 0;
        bool secondaryAvailable = secondaryData.length > 0;

        if (!primaryAvailable && !secondaryAvailable) {
            revert Errors.NoOracleData(token);
        }

        if (primaryAvailable && secondaryAvailable) {
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

        // Degraded mode: exactly one feed present.
        if (!dataStore.getBool(Keys.allowSingleOracleFallbackKey(token))) {
            revert Errors.OracleSingleFallbackDisabled(token);
        }

        OracleUtils.ValidatedPrice memory single;
        if (primaryAvailable) {
            single = primary.getOraclePrice(token, primaryData);
            emit OracleDegradedMode(token, false);
        } else {
            single = secondary.getOraclePrice(token, secondaryData);
            emit OracleDegradedMode(token, true);
        }

        // Re-attribute so downstream provider-based logic sees the wrapper uniformly.
        single.provider = address(this);
        return single;
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
