// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../insurance/InsuranceFundUtils.sol";
import "../insurance/InsuranceVault.sol";
import "../market/Market.sol";
import "../market/MarketUtils.sol";

// @title InsuranceFundUtilsTest
// @dev External test wrapper around the internal InsuranceFundUtils library
// so unit tests can call its functions through the normal hardhat-ethers path.
// Mirrors the MarketUtilsTest pattern.
//
// The deployed instance must be granted CONTROLLER role on RoleStore at test
// setup so it can drive MarketToken.transferOut, vault.transferOut /
// recordTransferIn, DataStore writes, and EventEmitter calls.
contract InsuranceFundUtilsTest {
    function getBalance(DataStore dataStore, address market, address token) external view returns (uint256) {
        return InsuranceFundUtils.getBalance(dataStore, market, token);
    }

    function getDrawdownFraction(
        DataStore dataStore,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices
    ) external view returns (uint256, uint256, uint256) {
        return InsuranceFundUtils.getDrawdownFraction(dataStore, market, prices);
    }

    function deposit(
        DataStore dataStore,
        EventEmitter eventEmitter,
        InsuranceVault vault,
        address market,
        address token,
        bytes32 orderKey,
        uint256 amount
    ) external returns (uint256) {
        return InsuranceFundUtils.deposit(dataStore, eventEmitter, vault, market, token, orderKey, amount);
    }

    function topUp(
        DataStore dataStore,
        EventEmitter eventEmitter,
        InsuranceVault vault,
        address market,
        address token,
        address depositor,
        uint256 amount
    ) external returns (uint256) {
        return InsuranceFundUtils.topUp(dataStore, eventEmitter, vault, market, token, depositor, amount);
    }

    function attemptInjectPool(
        DataStore dataStore,
        EventEmitter eventEmitter,
        InsuranceVault vault,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        address pnlToken,
        bytes32 orderKey
    ) external returns (uint256) {
        return InsuranceFundUtils.attemptInjectPool(dataStore, eventEmitter, vault, market, prices, pnlToken, orderKey);
    }

    function snapshotEpoch(
        DataStore dataStore,
        EventEmitter eventEmitter,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices
    ) external returns (uint256) {
        return InsuranceFundUtils.snapshotEpoch(dataStore, eventEmitter, market, prices);
    }
}
