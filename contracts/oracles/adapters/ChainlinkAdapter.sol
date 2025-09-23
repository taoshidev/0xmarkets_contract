// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../data/DataStore.sol";
import "../../data/Keys.sol";
import "../interfaces/IOracleProvider.sol";
import "./ChainlinkPriceFeedAdapter.sol";
import "./ChainlinkDataStreamAdapter.sol";
import "../../error/Errors.sol";

/**
 * @title ChainlinkAdapter
 * @dev Unified Chainlink adapter that routes between Price Feeds and Data Streams
 * Provides seamless migration path and per-token configuration flexibility
 * 
 * Architecture:
 * - Uses ChainlinkPriceFeedAdapter for Base chain compatibility
 * - Uses ChainlinkDataStreamAdapter when available on Base
 * - Routing: Automatically selects appropriate adapter based on token configuration
 */
contract ChainlinkAdapter is IOracleProvider {
    
    DataStore public immutable dataStore;
    address public immutable oracle;
    ChainlinkPriceFeedAdapter public immutable priceFeedAdapter;
    ChainlinkDataStreamAdapter public immutable dataStreamAdapter;
    
    // Chainlink operation modes
    enum ChainlinkMode {
        PRICE_FEEDS,    // Standard Chainlink price feeds
        DATA_STREAMS    // Chainlink Data Streams with bid/ask
    }

    // Events
    event ChainlinkModeSelected(
        address indexed token,
        ChainlinkMode mode,
        address adapter
    );


    constructor(
        DataStore _dataStore,
        address _oracle,
        ChainlinkPriceFeedAdapter _priceFeedAdapter,
        ChainlinkDataStreamAdapter _dataStreamAdapter
    ) {
        dataStore = _dataStore;
        oracle = _oracle;
        priceFeedAdapter = _priceFeedAdapter;
        dataStreamAdapter = _dataStreamAdapter;
    }

    /**
     * @dev Get oracle price by routing to appropriate Chainlink adapter
     * @param token The token to get price for
     * @param data The update payload (used for Data Streams, ignored for Price Feeds)
     * @return ValidatedPrice struct with price data
     */
    function getOraclePrice(
        address token,
        bytes memory data
    ) external returns (OracleUtils.ValidatedPrice memory) {
        
        // Determine which Chainlink mode to use for this token
        ChainlinkMode mode = getChainlinkMode(token);
        
        emit ChainlinkModeSelected(token, mode, _getAdapterAddress(mode));
        
        // Route to appropriate adapter
        if (mode == ChainlinkMode.DATA_STREAMS) {
            return dataStreamAdapter.getOraclePrice(token, data);
        } else {
            return priceFeedAdapter.getOraclePrice(token, data);
        }
    }

    /**
     * @dev Determine which Chainlink mode to use for a token
     * @param token The token address
     * @return mode The appropriate Chainlink mode
     */
    function getChainlinkMode(address token) public view returns (ChainlinkMode) {
        // Priority 1: Check if Data Streams are configured and available
        bytes32 dataStreamId = dataStore.getBytes32(Keys.dataStreamIdKey(token));
        address verifierAddress = address(dataStreamAdapter.getVerifierAddress());
        
        // If Data Streams feed is configured and verifier is available, use Data Streams
        if (dataStreamId != bytes32(0) && verifierAddress != address(0)) {
            return ChainlinkMode.DATA_STREAMS;
        }
        
        // Priority 2: Check if Price Feeds are configured
        address priceFeedAddress = dataStore.getAddress(Keys.priceFeedKey(token));
        if (priceFeedAddress != address(0)) {
            return ChainlinkMode.PRICE_FEEDS;
        }
        
        // If neither is configured, revert with existing error
        revert Errors.EmptyChainlinkPriceFeed(token);
    }

    /**
     * @dev Get the adapter address for a given mode
     * @param mode The Chainlink mode
     * @return adapterAddress The adapter contract address
     */
    function _getAdapterAddress(ChainlinkMode mode) internal view returns (address adapterAddress) {
        if (mode == ChainlinkMode.DATA_STREAMS) {
            return address(dataStreamAdapter);
        } else {
            return address(priceFeedAdapter);
        }
    }

    // ========== VIEW FUNCTIONS ==========

    /**
     * @dev Check if Data Streams are available for a token
     * @param token The token address
     * @return available True if Data Streams are configured and available
     */
    function isDataStreamsAvailable(address token) external view returns (bool available) {
        return getChainlinkMode(token) == ChainlinkMode.DATA_STREAMS;
    }

    /**
     * @dev Check if Price Feeds are available for a token
     * @param token The token address
     * @return available True if Price Feeds are configured
     */
    function isPriceFeedsAvailable(address token) external view returns (bool available) {
        return priceFeedAdapter.supportsToken(token);
    }

    /**
     * @dev Get the active adapter for a token
     * @param token The token address
     * @return adapter The active adapter contract address
     * @return mode The active Chainlink mode
     */
    function getActiveAdapter(address token) external view returns (address adapter, ChainlinkMode mode) {
        mode = getChainlinkMode(token);
        adapter = _getAdapterAddress(mode);
    }

    /**
     * @dev Check if this unified adapter supports a token
     * @param token The token address
     * @return supported True if either Price Feeds or Data Streams are configured
     */
    function supportsToken(address token) external view returns (bool supported) {
        return priceFeedAdapter.supportsToken(token) || dataStreamAdapter.supportsToken(token);
    }

    /**
     * @dev Get configuration summary for a token
     * @param token The token address
     * @return hasPriceFeeds True if Price Feeds are configured
     * @return hasDataStreams True if Data Streams are configured
     * @return activeMode The currently active mode
     */
    function getTokenConfiguration(address token) external view returns (
        bool hasPriceFeeds,
        bool hasDataStreams,
        ChainlinkMode activeMode
    ) {
        hasPriceFeeds = priceFeedAdapter.supportsToken(token);
        hasDataStreams = dataStreamAdapter.supportsToken(token);
        
        if (hasPriceFeeds || hasDataStreams) {
            activeMode = getChainlinkMode(token);
        }
    }

    // ========== ADAPTER PROXY FUNCTIONS ==========

    /**
     * @dev Get price feed address for a token (Price Feeds mode)
     * @param token The token address
     * @return priceFeed The price feed address
     */
    function getPriceFeedAddress(address token) external view returns (address priceFeed) {
        return priceFeedAdapter.getPriceFeedAddress(token);
    }

    /**
     * @dev Get Data Streams feed ID for a token (Data Streams mode)
     * @param token The token address
     * @return feedId The Data Streams feed ID
     */
    function getDataStreamFeedId(address token) external view returns (bytes32 feedId) {
        return dataStreamAdapter.getDataStreamFeedId(token);
    }

    /**
     * @dev Get heartbeat duration for a token (Price Feeds mode)
     * @param token The token address
     * @return duration The heartbeat duration in seconds
     */
    function getHeartbeatDuration(address token) external view returns (uint256 duration) {
        return priceFeedAdapter.getHeartbeatDuration(token);
    }
}