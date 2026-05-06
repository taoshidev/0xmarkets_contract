// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../role/RoleModule.sol";
import "../event/EventEmitter.sol";
import "../utils/BasicMulticall.sol";
import "../utils/Precision.sol";
import "../utils/Cast.sol";
import "../market/MarketUtils.sol";
import "./ConfigAllowedKeys.sol";
import "./ConfigValidatorUtils.sol";

// @title Config
contract Config is ReentrancyGuard, RoleModule, BasicMulticall {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    uint256 public constant MAX_FEE_FACTOR = (5 * Precision.FLOAT_PRECISION) / 100; // 5%

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    // @dev the base keys that can be set
    mapping(bytes32 => bool) public allowedBaseKeys;
    // @dev the limited base keys that can be set
    mapping(bytes32 => bool) public allowedLimitedBaseKeys;

    constructor(RoleStore _roleStore, DataStore _dataStore, EventEmitter _eventEmitter) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;

        ConfigAllowedKeys.initAllowedBaseKeys(allowedBaseKeys);
        // _initAllowedLimitedBaseKeys();
    }

    modifier onlyKeeper() {
        if (
            !roleStore.hasRole(msg.sender, Role.LIMITED_CONFIG_KEEPER) &&
            !roleStore.hasRole(msg.sender, Role.CONFIG_KEEPER)
        ) {
            revert Errors.Unauthorized(msg.sender, "LIMITED / CONFIG KEEPER");
        }

        _;
    }

    function initOracleProviderForToken(address token, address provider) external onlyConfigKeeper nonReentrant {
        if (dataStore.getAddress(Keys.oracleProviderForTokenKey(token)) != address(0)) {
            revert Errors.OracleProviderAlreadyExistsForToken(token);
        }

        dataStore.setAddress(Keys.oracleProviderForTokenKey(token), provider);

        EventUtils.EventLogData memory eventData;
        // eventData.addressItems.initItems(2);
        // eventData.addressItems.setItem(0, "token", token);
        // eventData.addressItems.setItem(1, "provider", provider);
        eventEmitter.emitEventLog("InitOracleProviderForToken", eventData);
    }

    function setPriceFeed(
        address token,
        address priceFeed,
        uint256 priceFeedMultiplier,
        uint256 priceFeedHeartbeatDuration,
        uint256 stablePrice
    ) external onlyConfigKeeper nonReentrant {
        if (dataStore.getAddress(Keys.priceFeedKey(token)) != address(0)) {
            revert Errors.PriceFeedAlreadyExistsForToken(token);
        }

        dataStore.setAddress(Keys.priceFeedKey(token), priceFeed);
        dataStore.setUint(Keys.priceFeedMultiplierKey(token), priceFeedMultiplier);
        dataStore.setUint(Keys.priceFeedHeartbeatDurationKey(token), priceFeedHeartbeatDuration);
        dataStore.setUint(Keys.stablePriceKey(token), stablePrice);

        EventUtils.EventLogData memory eventData;
        // eventData.addressItems.initItems(2);
        // eventData.addressItems.setItem(0, "token", token);
        // eventData.addressItems.setItem(1, "priceFeed", priceFeed);
        // eventData.uintItems.initItems(3);
        // eventData.uintItems.setItem(0, "priceFeedMultiplier", priceFeedMultiplier);
        // eventData.uintItems.setItem(1, "priceFeedHeartbeatDuration", priceFeedHeartbeatDuration);
        // eventData.uintItems.setItem(2, "stablePrice", stablePrice);
        eventEmitter.emitEventLog1("ConfigSetPriceFeed", Cast.toBytes32(token), eventData);
    }

    function setDataStream(
        address token,
        bytes32 feedId,
        bool dataStreamInverted,
        uint256 dataStreamMultiplier,
        uint256 dataStreamSpreadReductionFactor
    ) external onlyConfigKeeper nonReentrant {
        if (dataStore.getBytes32(Keys.dataStreamIdKey(token)) != bytes32(0)) {
            revert Errors.DataStreamIdAlreadyExistsForToken(token);
        }

        ConfigValidatorUtils.validateRange(
            dataStore,
            Keys.DATA_STREAM_SPREAD_REDUCTION_FACTOR,
            abi.encode(token),
            dataStreamSpreadReductionFactor
        );

        dataStore.setBytes32(Keys.dataStreamIdKey(token), feedId);
        dataStore.setBool(Keys.dataStreamInvertedKey(token), dataStreamInverted);
        dataStore.setUint(Keys.dataStreamMultiplierKey(token), dataStreamMultiplier);
        dataStore.setUint(Keys.dataStreamSpreadReductionFactorKey(token), dataStreamSpreadReductionFactor);

        EventUtils.EventLogData memory eventData;
        // eventData.addressItems.initItems(1);
        // eventData.addressItems.setItem(0, "token", token);
        // eventData.bytes32Items.initItems(1);
        // eventData.bytes32Items.setItem(0, "feedId", feedId);
        // eventData.boolItems.initItems(1);
        // eventData.boolItems.setItem(0, "dataStreamInverted", dataStreamInverted);
        // eventData.uintItems.initItems(2);
        // eventData.uintItems.setItem(0, "dataStreamMultiplier", dataStreamMultiplier);
        // eventData.uintItems.setItem(1, "dataStreamSpreadReductionFactor", dataStreamSpreadReductionFactor);

        eventEmitter.emitEventLog1("ConfigSetDataStream", Cast.toBytes32(token), eventData);
    }

    function setPythLazerFeed(
        address token,
        bytes32 pythLazerFeedId,
        bool pythLazerFeedInverted,
        uint256 pythLazerFeedMultiplier
    ) external onlyConfigKeeper nonReentrant {
        if (dataStore.getBytes32(Keys.dataStreamIdKey(token)) != bytes32(0)) {
            revert Errors.DataStreamIdAlreadyExistsForToken(token);
        }

        dataStore.setBytes32(Keys.dataStreamIdKey(token), pythLazerFeedId);
        dataStore.setBool(Keys.dataStreamInvertedKey(token), pythLazerFeedInverted);
        dataStore.setUint(Keys.dataStreamMultiplierKey(token), pythLazerFeedMultiplier);

        EventUtils.EventLogData memory eventData;
        // eventData.addressItems.initItems(1);
        // eventData.addressItems.setItem(0, "token", token);
        // eventData.bytes32Items.initItems(1);
        // eventData.bytes32Items.setItem(0, "pythLazerFeedId", pythLazerFeedId);
        // eventData.boolItems.initItems(1);
        // eventData.boolItems.setItem(0, "pythLazerFeedInverted", pythLazerFeedInverted);
        // eventData.uintItems.initItems(1);
        // eventData.uintItems.setItem(0, "pythLazerFeedMultiplier", pythLazerFeedMultiplier);

        eventEmitter.emitEventLog1("ConfigSetPythLazerFeed", Cast.toBytes32(token), eventData);
    }

    function setClaimableCollateralFactorForTime(
        address market,
        address token,
        uint256 timeKey,
        uint256 factor
    ) external onlyConfigKeeper nonReentrant {
        if (factor > Precision.FLOAT_PRECISION) {
            revert Errors.InvalidClaimableFactor(factor);
        }

        bytes32 key = Keys.claimableCollateralFactorKey(market, token, timeKey);
        dataStore.setUint(key, factor);

        EventUtils.EventLogData memory eventData;
        // eventData.addressItems.initItems(2);
        // eventData.addressItems.setItem(0, "market", market);
        // eventData.addressItems.setItem(1, "token", token);
        // eventData.uintItems.initItems(2);
        // eventData.uintItems.setItem(0, "timeKey", timeKey);
        // eventData.uintItems.setItem(1, "factor", factor);

        eventEmitter.emitEventLog2(
            "SetClaimableCollateralFactorForTime",
            Cast.toBytes32(market),
            Cast.toBytes32(token),
            eventData
        );
    }

    function setClaimableCollateralFactorForAccount(
        address market,
        address token,
        uint256 timeKey,
        address account,
        uint256 factor
    ) external onlyConfigKeeper nonReentrant {
        if (factor > Precision.FLOAT_PRECISION) {
            revert Errors.InvalidClaimableFactor(factor);
        }

        bytes32 key = Keys.claimableCollateralFactorKey(market, token, timeKey, account);
        dataStore.setUint(key, factor);

        EventUtils.EventLogData memory eventData;
        // eventData.addressItems.initItems(3);
        // eventData.addressItems.setItem(0, "market", market);
        // eventData.addressItems.setItem(1, "token", token);
        // eventData.addressItems.setItem(2, "account", account);
        // eventData.uintItems.initItems(2);
        // eventData.uintItems.setItem(0, "timeKey", timeKey);
        // eventData.uintItems.setItem(1, "factor", factor);

        eventEmitter.emitEventLog2(
            "SetClaimableCollateralFactorForAccount",
            Cast.toBytes32(market),
            Cast.toBytes32(token),
            eventData
        );
    }

    function setPositionImpactDistributionRate(
        address market,
        uint256 minPositionImpactPoolAmount,
        uint256 positionImpactPoolDistributionRate
    ) external onlyConfigKeeper nonReentrant {
        MarketUtils.distributePositionImpactPool(dataStore, eventEmitter, market);

        dataStore.setUint(Keys.minPositionImpactPoolAmountKey(market), minPositionImpactPoolAmount);
        dataStore.setUint(Keys.positionImpactPoolDistributionRateKey(market), positionImpactPoolDistributionRate);

        dataStore.setUint(Keys.positionImpactPoolDistributedAtKey(market), Chain.currentTimestamp());

        EventUtils.EventLogData memory eventData;
        // eventData.addressItems.initItems(1);
        // eventData.addressItems.setItem(0, "market", market);
        // eventData.uintItems.initItems(2);
        // eventData.uintItems.setItem(0, "minPositionImpactPoolAmount", minPositionImpactPoolAmount);
        // eventData.uintItems.setItem(1, "positionImpactPoolDistributionRate", positionImpactPoolDistributionRate);

        eventEmitter.emitEventLog1("SetPositionImpactPoolDistributionRate", Cast.toBytes32(market), eventData);
    }

    function setBaselineSwap(
        address market,
        uint256 baselineSwapPerDay,
        bool longsPayShorts
    ) external onlyConfigKeeper nonReentrant {
        _setBaselineSwap(market, baselineSwapPerDay, longsPayShorts, false);
    }

    function setBaselineSwap(
        address market,
        uint256 baselineSwapPerDay,
        bool longsPayShorts,
        bool reversed
    ) external onlyConfigKeeper nonReentrant {
        _setBaselineSwap(market, baselineSwapPerDay, longsPayShorts, reversed);
    }

    function _setBaselineSwap(
        address market,
        uint256 baselineSwapPerDay,
        bool longsPayShorts,
        bool reversed
    ) internal onlyConfigKeeper nonReentrant {
        dataStore.setBool(Keys.baselineSwapLongsPayShortsKey(market), reversed ? !longsPayShorts : longsPayShorts);
        dataStore.setUint(Keys.baselineSwapPerDayKey(market), baselineSwapPerDay);

        EventUtils.EventLogData memory eventData;
        // eventData.addressItems.initItems(1);
        // eventData.addressItems.setItem(0, "market", market);
        // eventData.uintItems.initItems(1);
        // eventData.uintItems.setItem(0, "baselineSwapPerDay", baselineSwapPerDay);
        // eventData.boolItems.initItems(1);
        // eventData.boolItems.setItem(0, "longsPayShorts", longsPayShorts);

        eventEmitter.emitEventLog1("SetBaselineSwap", Cast.toBytes32(market), eventData);
    }

    // @dev set a bool value
    // @param baseKey the base key of the value to set
    // @param data the additional data to be combined with the base key
    // @param value the bool value
    function setBool(bytes32 baseKey, bytes memory data, bool value) external onlyKeeper nonReentrant {
        _validateKey(baseKey);

        bytes32 fullKey = Keys.getFullKey(baseKey, data);

        dataStore.setBool(fullKey, value);

        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "baseKey", baseKey);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "data", data);

        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "value", value);

        eventEmitter.emitEventLog1("SetBool", baseKey, eventData);
    }

    // @dev set an address value
    // @param baseKey the base key of the value to set
    // @param data the additional data to be combined with the base key
    // @param value the address value
    function setAddress(bytes32 baseKey, bytes memory data, address value) external onlyKeeper nonReentrant {
        _validateKey(baseKey);

        bytes32 fullKey = Keys.getFullKey(baseKey, data);

        dataStore.setAddress(fullKey, value);

        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "baseKey", baseKey);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "data", data);

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "value", value);

        eventEmitter.emitEventLog1("SetAddress", baseKey, eventData);
    }

    // @dev set a bytes32 value
    // @param baseKey the base key of the value to set
    // @param data the additional data to be combined with the base key
    // @param value the bytes32 value
    function setBytes32(bytes32 baseKey, bytes memory data, bytes32 value) external onlyKeeper nonReentrant {
        _validateKey(baseKey);

        bytes32 fullKey = Keys.getFullKey(baseKey, data);

        dataStore.setBytes32(fullKey, value);

        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(2);
        eventData.bytes32Items.setItem(0, "baseKey", baseKey);
        eventData.bytes32Items.setItem(1, "value", value);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "data", data);

        eventEmitter.emitEventLog1("SetBytes32", baseKey, eventData);
    }

    // @dev set a uint256 value
    // @param basekey the base key of the value to set
    // @param data the additional data to be combined with the base key
    // @param value the uint256 value
    function setUint(bytes32 baseKey, bytes memory data, uint256 value) external onlyKeeper nonReentrant {
        _validateKey(baseKey);

        bytes32 fullKey = Keys.getFullKey(baseKey, data);

        ConfigValidatorUtils.validateRange(dataStore, baseKey, data, value);

        dataStore.setUint(fullKey, value);

        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "baseKey", baseKey);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "data", data);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "value", value);

        eventEmitter.emitEventLog1("SetUint", baseKey, eventData);
    }

    // @dev set an int256 value
    // @param basekey the base key of the value to set
    // @param data the additional data to be combined with the base key
    // @param value the int256 value
    function setInt(bytes32 baseKey, bytes memory data, int256 value) external onlyKeeper nonReentrant {
        _validateKey(baseKey);

        bytes32 fullKey = Keys.getFullKey(baseKey, data);

        dataStore.setInt(fullKey, value);

        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "baseKey", baseKey);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "data", data);

        eventData.intItems.initItems(1);
        eventData.intItems.setItem(0, "value", value);

        eventEmitter.emitEventLog1("SetInt", baseKey, eventData);
    }

    // @dev validate that the baseKey is allowed to be used
    // @param baseKey the base key to validate
    function _validateKey(bytes32 baseKey) internal view {
        if (roleStore.hasRole(msg.sender, Role.CONFIG_KEEPER)) {
            if (!allowedBaseKeys[baseKey]) {
                revert Errors.InvalidBaseKey(baseKey);
            }

            return;
        }

        // if (roleStore.hasRole(msg.sender, Role.LIMITED_CONFIG_KEEPER)) {
        //     if (!allowedLimitedBaseKeys[baseKey]) {
        //         revert Errors.InvalidBaseKey(baseKey);
        //     }
        //
        //     return;
        // }

        revert Errors.InvalidBaseKey(baseKey);
    }

}
