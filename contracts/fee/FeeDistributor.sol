// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";

import "../v1/IVaultV1.sol";
import "../v1/IRouterV1.sol";

import "../data/DataStore.sol";
import "../role/RoleModule.sol";
import "../fee/FeeUtils.sol";
import "../fee/FeeSwapUtils.sol";
import "../fee/FeeBatchStoreUtils.sol";
import "../market/Market.sol";
import "../nonce/NonceUtils.sol";
import "../router/IExchangeRouter.sol";

// @title FeeDistributor
contract FeeDistributor is ReentrancyGuard, RoleModule {
    using Market for Market.Props;
    using Order for Order.Props;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    IVaultV1 public immutable vaultV1;
    IRouterV1 public immutable routerV1;

    address public immutable routerV2;
    IExchangeRouter public immutable exchangeRouterV2;

    address public immutable bridgingToken;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IVaultV1 _vaultV1,
        IRouterV1 _routerV1,
        address _routerV2,
        IExchangeRouter _exchangeRouterV2,
        address _bridgingToken
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;

        vaultV1 = _vaultV1;
        routerV1 = _routerV1;

        routerV2 = _routerV2;
        exchangeRouterV2 = _exchangeRouterV2;

        bridgingToken = _bridgingToken;
    }

    function swapFeesUsingV1(
        bytes32 feeBatchKey,
        uint256 tokenIndex,
        address[] memory path,
        uint256 swapAmount,
        uint256 minOut
    ) external {
        FeeSwapUtils.swapFeesUsingV1(
            dataStore,
            routerV1,
            bridgingToken,
            feeBatchKey,
            tokenIndex,
            path,
            swapAmount,
            minOut
        );
    }

    function swapFeesUsingV2(
        bytes32 feeBatchKey,
        uint256 tokenIndex,
        address market,
        address[] memory swapPath,
        uint256 swapAmount,
        uint256 executionFee,
        uint256 minOut
    ) external payable {
        FeeSwapUtils.swapFeesUsingV2(
            dataStore,
            routerV2,
            exchangeRouterV2,
            bridgingToken,
            feeBatchKey,
            tokenIndex,
            market,
            swapPath,
            swapAmount,
            executionFee,
            minOut
        );
    }

    // handle order cancellation callbacks
    function afterOrderCancellation(
        bytes32 orderKey,
        Order.Props memory order,
        EventUtils.EventLogData memory /* eventData */
    ) external {
        // validate that the caller has a controller role, the only controller that
        // should call this function is the OrderHandler
        _validateRole(Role.CONTROLLER, "CONTROLLER");

        bytes32 feeBatchKey = dataStore.getBytes32(Keys.feeDistributorSwapFeeBatchKey(orderKey));
        uint256 tokenIndex = dataStore.getUint(Keys.feeDistributorSwapTokenIndexKey(orderKey));

        FeeBatch.Props memory feeBatch = FeeBatchStoreUtils.get(dataStore, feeBatchKey);
        feeBatch.remainingAmounts[tokenIndex] += order.initialCollateralDeltaAmount();
        FeeBatchStoreUtils.set(dataStore, feeBatchKey, feeBatch);
    }

    function _claimFeesV1(FeeBatch.Props memory feeBatch, uint256 count) internal returns (FeeBatch.Props memory) {
        for (uint256 i; i < count; i++) {
            // it is possible for the token to be address(0) the withdrawFees
            // function should just return 0 in that case
            address token = vaultV1.allWhitelistedTokens(i);
            uint256 amount = vaultV1.withdrawFees(token, address(this));

            feeBatch.feeTokens[i] = token;
            feeBatch.feeAmounts[i] = amount;
            feeBatch.remainingAmounts[i] = amount;
        }

        return feeBatch;
    }

}
