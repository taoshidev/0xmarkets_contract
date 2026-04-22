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
//      applies a reconciliation policy, and returns a single ValidatedPrice.
//      Reverts the trade if the policy rejects the pair.
//
//      The keeper must pack the `data` blob as:
//          abi.encode(bytes primaryData, bytes secondaryData)
//      which is unpacked here and routed to each underlying provider.
//
// @dev ACCESS CONTROL NOTE: ChainlinkDataStreamProvider enforces onlyOracle.
//      If `secondary` is that contract, the delegating call below will revert
//      because msg.sender (this wrapper) != oracle. See TODO in constructor.
contract CircuitBreakerOracleProvider is IOracleProvider {
    DataStore public immutable dataStore;
    IOracleProvider public immutable primary;
    IOracleProvider public immutable secondary;

    constructor(
        DataStore _dataStore,
        IOracleProvider _primary,
        IOracleProvider _secondary
    ) {
        // TODO(access-control): Before deploying, pick ONE of:
        //   (a) relax onlyOracle in ChainlinkDataStreamProvider to allow this wrapper
        //   (b) add a setAuthorizedCaller(address) allowlist to ChainlinkDataStreamProvider
        //   (c) rewrite this wrapper to call IChainlinkDataStreamVerifier.verify() directly
        //       (duplicates the Chainlink parsing logic — auditable, no upstream changes)
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

    // -------------------------------------------------------------------------
    //
    //                    *** IMPLEMENT YOUR POLICY HERE ***
    //
    // This is the actual circuit breaker. Given two ValidatedPrices for the
    // same token, decide whether the pair is acceptable and what to return.
    //
    // Both `.min` and `.max` are 30-decimal fixed-point (1e30 == $1). They
    // represent bid / ask respectively. Precision.FLOAT_PRECISION = 1e30.
    //
    // Design questions you must answer in code:
    //
    //   1. DEVIATION CHECK — how do you measure disagreement?
    //        Option: midpoint-vs-midpoint deviation in bps
    //          mid_p = (primaryPrice.min + primaryPrice.max) / 2
    //          mid_s = (secondaryPrice.min + secondaryPrice.max) / 2
    //          deviationBps = |mid_p - mid_s| * 10_000 / mid_p
    //        Option: per-side (min-to-min AND max-to-max must both be within band)
    //
    //   2. THRESHOLD — where does the threshold live?
    //        Option: hardcoded constant (simplest, safest to audit)
    //        Option: per-token DataStore key (tune majors vs alts without redeploy)
    //          e.g. dataStore.getUint(Keys.circuitBreakerDeviationBpsKey(token))
    //
    //   3. TIMESTAMP SKEW — reject if the two feeds disagree on WHEN?
    //        Pyth Lazer is sub-second, Chainlink Data Streams is slower.
    //        Suggested tolerance: 2-5 seconds. Use block.timestamp as reference
    //        if you want to reject stale secondary too.
    //
    //   4. RETURN POLICY — which price do you hand back if the check passes?
    //        Option: primary (trust Pyth, Chainlink was only a sanity check)
    //        Option: defensive — return the WORSE pair for the trader:
    //              min: Math.min(primary.min, secondary.min)
    //              max: Math.max(primary.max, secondary.max)
    //          This widens spread on disagreement, protocol-friendly
    //        Option: midpoint blend (loses bid/ask signal — avoid)
    //
    //   5. ERROR SURFACE — on rejection, revert with a typed error:
    //        Add to contracts/error/Errors.sol:
    //          error OracleCircuitBreakerDeviation(
    //              address token,
    //              uint256 primaryMid,
    //              uint256 secondaryMid,
    //              uint256 observedBps,
    //              uint256 maxBps
    //          );
    //          error OracleCircuitBreakerTimestampSkew(
    //              address token,
    //              uint256 primaryTs,
    //              uint256 secondaryTs
    //          );
    //
    // Keep it under ~15 lines. If you reach for complex logic, it probably
    // belongs in a helper library, not the policy function.
    //
    // -------------------------------------------------------------------------
    function _reconcilePrices(
        address token,
        OracleUtils.ValidatedPrice memory primaryPrice,
        OracleUtils.ValidatedPrice memory secondaryPrice
    ) internal view returns (OracleUtils.ValidatedPrice memory) {
        // TODO(ken): implement reconciliation policy per comment block above.
        revert("CircuitBreakerOracleProvider: _reconcilePrices not implemented");
    }
}
