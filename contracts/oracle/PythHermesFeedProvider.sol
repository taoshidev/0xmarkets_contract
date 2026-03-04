// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./IOracleProvider.sol";
import "./OracleUtils.sol";

// @title PythHermesFeedProvider
// @dev Stateless oracle provider that decodes Pyth Hermes price data
// passed by the keeper as ABI-encoded (uint256 price, uint256 conf, int32 expo, uint256 publishTime)
// and returns a ValidatedPrice with FLOAT_PRECISION (10^30) scaling.
//
// No on-chain storage, no signature verification. The handler's onlyController
// modifier ensures only the keeper can trigger this path.
contract PythHermesFeedProvider is IOracleProvider {
    uint256 constant FLOAT_PRECISION = 10 ** 30;

    function getOraclePrice(
        address token,
        bytes memory data
    ) external view returns (OracleUtils.ValidatedPrice memory) {
        (uint256 price, uint256 conf, int32 expo, uint256 publishTime) = abi.decode(
            data,
            (uint256, uint256, int32, uint256)
        );

        // Convert Pyth price to FLOAT_PRECISION (10^30)
        // Real price = price * 10^expo, target = realPrice * 10^30 = price * 10^(30 + expo)
        uint256 multiplier;
        if (expo >= 0) {
            multiplier = 10 ** (30 + uint32(expo));
        } else {
            multiplier = 10 ** (30 - uint32(-expo));
        }

        uint256 minPrice = (price - conf) * multiplier;
        uint256 maxPrice = (price + conf) * multiplier;

        return OracleUtils.ValidatedPrice({
            token: token,
            min: minPrice,
            max: maxPrice,
            timestamp: publishTime,
            provider: address(this)
        });
    }
}
