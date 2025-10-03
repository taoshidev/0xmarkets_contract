// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../data/DataStore.sol";
import "../../data/Keys.sol";
import "../../error/Errors.sol";
import "../interfaces/IOracleProvider.sol";
import "./OracleUtils.sol";

// @title PythUtils
// @dev Library for Pyth price feed utilities, following GMX ChainlinkPriceFeedUtils pattern
library PythUtils {
    
    // @dev Get Pyth price for a token if configured
    // @param dataStore DataStore contract
    // @param token The token to get price for
    // @return hasPrice Whether Pyth price is available
    // @return price The Pyth price (with confidence as max value)
    function getPythPrice(
        DataStore dataStore,
        address token
    ) internal returns (bool hasPrice, OracleUtils.ValidatedPrice memory price) {
        
        // Check if token has Pyth feed configured
        bytes32 pythFeedId = dataStore.getBytes32(Keys.pythFeedIdKey(token));
        if (pythFeedId == bytes32(0)) {
            return (false, price);
        }
        
        // Get PythAdapter address
        address pythAdapter = dataStore.getAddress(Keys.PYTH_ORACLE_PROVIDER);
        if (pythAdapter == address(0) || 
            !dataStore.getBool(Keys.isOracleProviderEnabledKey(pythAdapter))) {
            return (false, price);
        }
        
        // Get Pyth price from adapter (note: this may modify state if price needs updating)
        try IOracleProvider(pythAdapter).getOraclePrice(token, "") returns (
            OracleUtils.ValidatedPrice memory pythPrice
        ) {
            return (true, pythPrice);
        } catch {
            return (false, price);
        }
    }
    
    // @dev Validate primary price against Pyth reference using 0xMarket dual-oracle logic
    // @param dataStore DataStore contract
    // @param token The token being validated
    // @param primaryPrice The primary price to validate
    // @param primaryTimestamp The primary price timestamp
    // @param primaryProvider The primary provider address
    function validateDualOracle(
        DataStore dataStore,
        address token,
        uint256 primaryPrice,
        uint256 primaryTimestamp,
        address primaryProvider
    ) internal {
        
        (bool hasPythPrice, OracleUtils.ValidatedPrice memory pythPrice) = getPythPrice(dataStore, token);
        if (!hasPythPrice) {
            // No Pyth price available, skip validation
            return;
        }
        
        // Task 3 Validation Logic - Split into separate scoped blocks to reduce stack depth
        
        // 1. Check both prices are fresh (within TTLs)
        {
            uint256 chainlinkTtl = dataStore.getUint(Keys.chainlinkOracleTTLKey(token));
            uint256 pythTtl = dataStore.getUint(Keys.pythOracleTTLKey(token));
            if (chainlinkTtl == 0) chainlinkTtl = 2; // Default 2 seconds
            if (pythTtl == 0) pythTtl = 2;           // Default 2 seconds
            
            uint256 currentTime = block.timestamp;
            if (currentTime > primaryTimestamp && currentTime - primaryTimestamp > chainlinkTtl) {
                revert Errors.OraclePriceNotFresh(token, primaryProvider, primaryTimestamp, currentTime);
            }
            if (currentTime > pythPrice.timestamp && currentTime - pythPrice.timestamp > pythTtl) {
                revert Errors.OraclePriceNotFresh(token, address(0), pythPrice.timestamp, currentTime);
            }
        }
        
        // 2. Check time skew between oracles
        {
            uint256 maxTimeSkew = dataStore.getUint(Keys.maxOracleTimeSkewKey(token));
            if (maxTimeSkew == 0) maxTimeSkew = 600; // Default 600ms
            
            uint256 timeSkew = primaryTimestamp > pythPrice.timestamp 
                ? primaryTimestamp - pythPrice.timestamp
                : pythPrice.timestamp - primaryTimestamp;
                
            if (timeSkew > maxTimeSkew) {
                revert Errors.OracleTimeSkewExceeded(token, primaryTimestamp, pythPrice.timestamp, timeSkew, maxTimeSkew);
            }
        }
        
        // 3. Check if primary price is within Pyth confidence bands
        // Normalize both oracle prices based on their individual inversion flags
        {
            uint256 k = dataStore.getUint(Keys.pythConfidenceMultiplierKey(token));
            if (k == 0) k = 3; // Default K=3
            
            uint256 pythMid = pythPrice.min;        // Pyth price
            uint256 pythConf = pythPrice.max;       // Pyth confidence
            
            // Get inversion flags for each oracle provider
            bool chainlinkInverted = dataStore.getBool(Keys.chainlinkOracleInvertedKey(token));
            bool pythInverted = dataStore.getBool(Keys.pythOracleInvertedKey(token));
            
            uint256 normalizedPrimaryPrice = primaryPrice;
            uint256 normalizedPythPrice = pythMid;
            uint256 normalizedPythConf = pythConf;
            
            // Normalize prices based on their inversion flags
            // Both oracles should be normalized to the same format for comparison
            if (chainlinkInverted) {
                // Chainlink provides inverted format, normalize it
                normalizedPrimaryPrice = (1e60) / primaryPrice; // 1e60 for precision
            }
            
            if (pythInverted) {
                // Pyth provides inverted format, normalize it
                normalizedPythPrice = (1e60) / pythMid;
                normalizedPythConf = (pythConf * 1e60) / (pythMid * pythMid); // Adjust confidence for inverted price
            }
            
            uint256 bandWidth = (normalizedPythConf * k) / 1e18; // K * confidence
            
            // Compare normalized prices
            if (normalizedPrimaryPrice < (normalizedPythPrice > bandWidth ? normalizedPythPrice - bandWidth : 0) || 
                normalizedPrimaryPrice > normalizedPythPrice + bandWidth) {
                revert Errors.OraclePriceBandViolation(
                    token, 
                    normalizedPrimaryPrice, 
                    normalizedPythPrice, 
                    bandWidth, 
                    normalizedPythPrice > bandWidth ? normalizedPythPrice - bandWidth : 0,
                    normalizedPythPrice + bandWidth
                );
            }
        }
    }
}