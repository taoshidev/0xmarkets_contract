// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../data/DataStore.sol";
import "../../data/Keys.sol";
import "../interfaces/IOracleProvider.sol";
import "../interfaces/IPriceFeed.sol";
import "../../utils/Precision.sol";
import "../../chain/Chain.sol";
import "../../error/Errors.sol";

/**
 * @title ChainlinkPriceFeedAdapter
 * @dev V1 adapter for standard Chainlink Price Feeds
 * Designed specifically for Base chain where Data Streams are not yet available
 * Provides reliable price data with staleness checks and precision conversion
 */
contract ChainlinkPriceFeedAdapter is IOracleProvider {
    
    DataStore public immutable dataStore;
    address public immutable oracle;
    
    // Events
    event ChainlinkPriceUpdated(
        address indexed token,
        address indexed priceFeed,
        uint256 price,
        uint256 timestamp,
        uint80 roundId
    );

    modifier onlyOracle() {
        if (msg.sender != oracle) {
            revert Errors.Unauthorized(msg.sender, "Oracle");
        }
        _;
    }

    constructor(
        DataStore _dataStore,
        address _oracle
    ) {
        dataStore = _dataStore;
        oracle = _oracle;
    }

    /**
     * @dev Get oracle price from Chainlink price feed
     * @param token The token to get price for
     * @return ValidatedPrice struct with price data
     */
    function getOraclePrice(
        address token,
        bytes memory /* data */
    ) external onlyOracle returns (OracleUtils.ValidatedPrice memory) {
        
        // Get price feed address for this token
        address priceFeedAddress = dataStore.getAddress(Keys.priceFeedKey(token));
        if (priceFeedAddress == address(0)) {
            revert Errors.EmptyChainlinkPriceFeed(token);
        }

        // Get latest price data from Chainlink feed
        (uint80 roundId, int256 answer, /* uint256 startedAt */, uint256 updatedAt, uint80 answeredInRound) = 
            IPriceFeed(priceFeedAddress).latestRoundData();

        // Validate price data
        if (answer <= 0) {
            revert Errors.InvalidFeedPrice(token, answer);
        }

        // Check for stale data (Task 1 requirement)
        uint256 heartbeatDuration = _getHeartbeatDuration(token);
        if (Chain.currentTimestamp() > updatedAt && 
            Chain.currentTimestamp() - updatedAt > heartbeatDuration) {
            revert Errors.ChainlinkPriceFeedNotUpdated(token, updatedAt, heartbeatDuration);
        }

        // Validate round data integrity  
        if (roundId == 0 || answeredInRound < roundId) {
            revert Errors.InvalidFeedPrice(token, answer);
        }

        // Convert and return validated price
        return _buildValidatedPrice(token, priceFeedAddress, answer, updatedAt, roundId);
    }

    /**
     * @dev Build validated price struct from Chainlink data
     * @param token The token address
     * @param priceFeedAddress The price feed address
     * @param answer The price from Chainlink
     * @param updatedAt The timestamp from Chainlink
     * @param roundId The round ID from Chainlink
     * @return ValidatedPrice struct
     */
    function _buildValidatedPrice(
        address token,
        address priceFeedAddress,
        int256 answer,
        uint256 updatedAt,
        uint80 roundId
    ) internal returns (OracleUtils.ValidatedPrice memory) {
        // Convert price to correct precision (30 decimals)
        uint256 price = uint256(answer);
        uint256 precision = _getPriceFeedMultiplier(token);
        uint256 adjustedPrice = Precision.mulDiv(price, precision, Precision.FLOAT_PRECISION);

        // Apply stable price logic if configured (matching GMX pattern)
        uint256 stablePrice = dataStore.getUint(Keys.stablePriceKey(token));
        uint256 minPrice = adjustedPrice;
        uint256 maxPrice = adjustedPrice;

        if (stablePrice > 0) {
            minPrice = adjustedPrice < stablePrice ? adjustedPrice : stablePrice;
            maxPrice = adjustedPrice < stablePrice ? stablePrice : adjustedPrice;
        }

        emit ChainlinkPriceUpdated(token, priceFeedAddress, adjustedPrice, updatedAt, roundId);

        return OracleUtils.ValidatedPrice({
            token: token,
            min: minPrice,
            max: maxPrice,
            timestamp: updatedAt,
            provider: address(this)
        });
    }

    /**
     * @dev Get price feed multiplier for precision adjustment
     * @param token The token address
     * @return multiplier The precision multiplier
     */
    function _getPriceFeedMultiplier(address token) internal view returns (uint256) {
        uint256 multiplier = dataStore.getUint(Keys.priceFeedMultiplierKey(token));
        
        if (multiplier == 0) {
            revert Errors.EmptyChainlinkPriceFeedMultiplier(token);
        }

        return multiplier;
    }

    /**
     * @dev Get the heartbeat duration for a token's price feed
     * @param token The token address
     * @return duration The heartbeat duration in seconds
     */
    function _getHeartbeatDuration(address token) internal view returns (uint256 duration) {
        uint256 heartbeat = dataStore.getUint(Keys.priceFeedHeartbeatDurationKey(token));
        return heartbeat > 0 ? heartbeat : 3600; // Default 1 hour
    }

    // ========== VIEW FUNCTIONS ==========

    /**
     * @dev Get the price feed address for a token
     * @param token The token address
     * @return priceFeed The price feed address
     */
    function getPriceFeedAddress(address token) external view returns (address priceFeed) {
        return dataStore.getAddress(Keys.priceFeedKey(token));
    }

    /**
     * @dev Get the heartbeat duration for a token's price feed
     * @param token The token address
     * @return duration The heartbeat duration in seconds
     */
    function getHeartbeatDuration(address token) external view returns (uint256 duration) {
        return _getHeartbeatDuration(token);
    }

    /**
     * @dev Check if this adapter supports a token
     * @param token The token address
     * @return supported True if price feed is configured
     */
    function supportsToken(address token) external view returns (bool supported) {
        return dataStore.getAddress(Keys.priceFeedKey(token)) != address(0);
    }
}
