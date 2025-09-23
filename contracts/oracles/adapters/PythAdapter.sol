// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../data/DataStore.sol";
import "../../data/Keys.sol";
import "../interfaces/IOracleProvider.sol";
import "../utils/OracleUtils.sol";
import "../../utils/Precision.sol";
import "../../chain/Chain.sol";
import "../../error/Errors.sol";

import {PythLazer} from "pyth-lazer/PythLazer.sol";
import {PythLazerLib} from "pyth-lazer/PythLazerLib.sol";

/**
 * @title PythAdapter
 * @dev Reference oracle for dual-oracle validation system
 * Returns pyth_price, pyth_conf, pyth_publish_time for Oracle.sol validation
 * Callers pay their own Pyth verification fees
 */
contract PythAdapter is IOracleProvider {
    
    DataStore public immutable dataStore;
    address public immutable oracle;        // Oracle.sol address
    PythLazer public immutable pythLazer;
    
    // Simplified result structure
    struct PythPriceData {
        uint256 price;          // pyth_price (30 decimals)
        uint256 confidence;     // pyth_conf (30 decimals) 
        uint256 publishTime;    // pyth_publish_time
        bool isValid;
    }
    
    // Storage for verified Pyth prices
    mapping(address => PythPriceData) public storedPrices;
    
    event PythReferencePrice(
        address indexed token,
        address indexed caller,
        uint32 indexed feedId,
        uint256 price,
        uint256 confidence, 
        uint256 publishTime,
        uint256 feeUsed
    );
    
    event PythVerificationFeeRefund(
        address indexed caller,
        uint256 excessAmount
    );
    
    modifier onlyOracle() {
        require(msg.sender == oracle, "PythAdapter: Only oracle allowed");
        _;
    }
    
    constructor(
        DataStore _dataStore,
        address _oracle,
        PythLazer _pythLazer
    ) {
        dataStore = _dataStore;
        oracle = _oracle;
        pythLazer = _pythLazer;
    }
    
    /**
     * @dev Get reference price data for dual-oracle validation
     * Reads already updated prices from PythLazer (no payment needed here)
     * @param token The token to get price for
     * @return ValidatedPrice with price as main value, confidence in custom field
     */
    function getOraclePrice(
        address token,
        bytes memory /* data */  
    ) external view onlyOracle returns (OracleUtils.ValidatedPrice memory) {
        
        // Read stored price (updated by updatePrice function)
        PythPriceData memory pythData = storedPrices[token];
        require(pythData.isValid, "PythAdapter: No valid price available");
        
        // Basic staleness check (Oracle.sol will do main validation)
        uint256 maxAge = dataStore.getUint(Keys.MAX_ORACLE_PRICE_AGE);
        if (maxAge > 0 && Chain.currentTimestamp() > pythData.publishTime && 
            Chain.currentTimestamp() - pythData.publishTime > maxAge) {
            revert Errors.MaxPriceAgeExceeded(pythData.publishTime, Chain.currentTimestamp());
        }
        
        // Return data structured for Oracle.sol
        // Oracle.sol will extract: pyth_price, pyth_conf, pyth_publish_time
        return OracleUtils.ValidatedPrice({
            token: token,
            min: pythData.price,           // Main pyth_price
            max: pythData.confidence,      // Confidence interval (repurposed max field)
            timestamp: pythData.publishTime, // pyth_publish_time
            provider: address(this)
        });
    }
    
    /**
     * @dev Public function for anyone to update Pyth prices
     * Useful for relayers, arbitrageurs, or anyone wanting fresh prices
     * @param token The token to update price for
     * @param pythUpdate Pyth update payload
     * @return success Whether update was successful
     */
    function updatePrice(
        address token,
        bytes memory pythUpdate
    ) external payable returns (bool success) {
        
        require(pythUpdate.length > 0, "PythAdapter: Update data required");
        
        uint256 verificationFee = pythLazer.verification_fee();
        require(msg.value >= verificationFee, "PythAdapter: Insufficient fee provided");
        
        (bytes memory payload,) = pythLazer.verifyUpdate{value: verificationFee}(pythUpdate);
        
        // Refund excess fee to caller
        if (msg.value > verificationFee) {
            uint256 excess = msg.value - verificationFee;
            payable(msg.sender).transfer(excess);
            emit PythVerificationFeeRefund(msg.sender, excess);
        }
        
        // Extract and validate price data from verified payload
        PythPriceData memory pythData = _parsePythPayload(token, payload);
        
        if (pythData.isValid) {
            // Store the verified price data in our contract
            storedPrices[token] = pythData;
            
            uint32 feedId = _getPythFeedId(token);
            emit PythReferencePrice(
                token, 
                msg.sender,  // Track who paid for this update
                feedId, 
                pythData.price, 
                pythData.confidence, 
                pythData.publishTime,
                verificationFee
            );
            return true;
        }
        
        return false;
    }
    
    
    /**
     * @dev Parse Pyth payload and extract price/confidence
     */
    function _parsePythPayload(
        address token,
        bytes memory payload  
    ) internal view returns (PythPriceData memory result) {
        
        uint32 feedId = _getPythFeedId(token);
        
        // Parse payload header
        (uint64 timestamp, PythLazerLib.Channel channel, uint8 feedsLen, uint16 pos) =
            PythLazerLib.parsePayloadHeader(payload);
            
        require(channel == PythLazerLib.Channel.RealTime, "PythAdapter: Invalid channel");
        
        // Find target feed and extract price data
        for (uint8 i = 0; i < feedsLen; i++) {
            uint32 currentFeedId;
            uint8 numProperties;
            (currentFeedId, numProperties, pos) = PythLazerLib.parseFeedHeader(payload, pos);
            
            if (currentFeedId == feedId) {
                return _extractPriceData(payload, numProperties, pos, timestamp);
            } else {
                // Skip this feed
                pos = _skipFeedProperties(payload, numProperties, pos);
            }
        }
        
        // Feed not found
        return PythPriceData(0, 0, timestamp, false);
    }
    
    /**
     * @dev Extract price and confidence from target feed
     */
    function _extractPriceData(
        bytes memory payload,
        uint8 numProperties,
        uint16 startPos,
        uint64 timestamp
    ) internal pure returns (PythPriceData memory) {
        
        // Parse properties and return early to avoid stack too deep
        (uint64 rawPrice, uint64 bestBidPrice, uint64 bestAskPrice, int16 exponent, bool isValid) = 
            _parseProperties(payload, numProperties, startPos);
        
        if (!isValid || rawPrice == 0) {
            return PythPriceData(0, 0, timestamp, false);
        }
        
        // Convert to 30 decimals
        uint256 adjustedPrice = _adjustPricePrecision(rawPrice, exponent);
        
        // Calculate confidence
        uint256 confidence = _calculateConfidence(
            bestBidPrice,
            bestAskPrice, 
            exponent,
            adjustedPrice
        );
            
        return PythPriceData(adjustedPrice, confidence, timestamp, true);
    }
    
    /**
     * @dev Parse properties from payload
     */
    function _parseProperties(
        bytes memory payload,
        uint8 numProperties,
        uint16 startPos
    ) internal pure returns (
        uint64 rawPrice,
        uint64 bestBidPrice,
        uint64 bestAskPrice,
        int16 exponent,
        bool isValid
    ) {
        uint16 pos = startPos;
        bool hasPrice = false;
        bool hasExponent = false;
        
        // Parse all properties (must not skip any!)
        for (uint8 j = 0; j < numProperties; j++) {
            PythLazerLib.PriceFeedProperty property;
            (property, pos) = PythLazerLib.parseFeedProperty(payload, pos);
            
            if (property == PythLazerLib.PriceFeedProperty.Price) {
                (rawPrice, pos) = PythLazerLib.parseFeedValueUint64(payload, pos);
                hasPrice = true;
            } else if (property == PythLazerLib.PriceFeedProperty.BestBidPrice) {
                (bestBidPrice, pos) = PythLazerLib.parseFeedValueUint64(payload, pos);
            } else if (property == PythLazerLib.PriceFeedProperty.BestAskPrice) {
                (bestAskPrice, pos) = PythLazerLib.parseFeedValueUint64(payload, pos);
            } else if (property == PythLazerLib.PriceFeedProperty.Exponent) {
                (exponent, pos) = PythLazerLib.parseFeedValueInt16(payload, pos);
                hasExponent = true;
            } else if (property == PythLazerLib.PriceFeedProperty.PublisherCount) {
                uint16 temp;
                (temp, pos) = PythLazerLib.parseFeedValueUint16(payload, pos);
            } else {
                // Revert on unknown properties
                revert("PythAdapter: Unknown property");
            }
        }
        
        isValid = hasPrice && hasExponent;
    }
    
    /**
     * @dev Calculate confidence from bid/ask spread
     */
    function _calculateConfidence(
        uint64 bestBidPrice,
        uint64 bestAskPrice,
        int16 exponent,
        uint256 adjustedPrice
    ) internal pure returns (uint256 confidence) {
        if (bestBidPrice > 0 && bestAskPrice > 0 && bestAskPrice > bestBidPrice) {
            // Use bid/ask spread as confidence
            uint256 adjustedBid = _adjustPricePrecision(bestBidPrice, exponent);
            uint256 adjustedAsk = _adjustPricePrecision(bestAskPrice, exponent);
            confidence = (adjustedAsk - adjustedBid) / 2; // Half spread
            
            // Cap confidence at 10% of price
            uint256 maxConfidence = adjustedPrice / 10;
            if (confidence > maxConfidence) {
                confidence = maxConfidence;
            }
        } else {
            // Default to 1% confidence if no bid/ask available
            confidence = adjustedPrice / 100;
        }
    }
    
    /**
     * @dev Convert Pyth price to 30 decimal precision
     */
    function _adjustPricePrecision(uint64 price, int16 exponent) internal pure returns (uint256) {
        require(price > 0, "Invalid price");
        require(exponent >= -18 && exponent <= 10, "Invalid exponent");
        
        uint256 adjustedPrice = uint256(price);
        
        if (exponent < 0) {
            uint256 decimals = uint256(uint16(-exponent));
            if (decimals < 30) {
                adjustedPrice = adjustedPrice * (10 ** (30 - decimals));
            } else if (decimals > 30) {
                adjustedPrice = adjustedPrice / (10 ** (decimals - 30));
            }
        } else {
            adjustedPrice = adjustedPrice * (10 ** (uint256(uint16(exponent)) + 30));
        }
        
        return adjustedPrice;
    }
    
    /**
     * @dev Skip feed properties we don't need
     */
    function _skipFeedProperties(
        bytes memory payload,
        uint8 numProperties,
        uint16 startPos
    ) internal pure returns (uint16) {
        uint16 pos = startPos;
        
        // Must parse all properties to maintain correct position
        for (uint8 j = 0; j < numProperties; j++) {
            PythLazerLib.PriceFeedProperty property;
            (property, pos) = PythLazerLib.parseFeedProperty(payload, pos);
            
            // Parse the value based on property type to maintain pos correctly
            if (property == PythLazerLib.PriceFeedProperty.Price) {
                uint64 value;
                (value, pos) = PythLazerLib.parseFeedValueUint64(payload, pos);
            } else if (property == PythLazerLib.PriceFeedProperty.BestBidPrice) {
                uint64 value;
                (value, pos) = PythLazerLib.parseFeedValueUint64(payload, pos);
            } else if (property == PythLazerLib.PriceFeedProperty.BestAskPrice) {
                uint64 value;
                (value, pos) = PythLazerLib.parseFeedValueUint64(payload, pos);
            } else if (property == PythLazerLib.PriceFeedProperty.Exponent) {
                int16 value;
                (value, pos) = PythLazerLib.parseFeedValueInt16(payload, pos);
            } else if (property == PythLazerLib.PriceFeedProperty.PublisherCount) {
                uint16 value;
                (value, pos) = PythLazerLib.parseFeedValueUint16(payload, pos);
            } else {
                revert("PythAdapter: Unknown property");
            }
        }
        return pos;
    }
    
    /**
     * @dev Get Pyth feed ID for token
     */
    function _getPythFeedId(address token) internal view returns (uint32) {
        uint32 feedId = uint32(dataStore.getUint(Keys.pythFeedIdKey(token)));
        require(feedId != 0, "PythAdapter: No feed ID configured");
        return feedId;
    }
    
    // ========== VIEW FUNCTIONS ==========
    
    /**
     * @dev Get current Pyth verification fee
     * @return fee Current fee in wei
     */
    function getCurrentVerificationFee() external view returns (uint256 fee) {
        return pythLazer.verification_fee();
    }
    
    /**
     * @dev Check if a token has Pyth feed configured
     * @param token Token to check
     * @return configured True if feed ID is configured
     */
    function isTokenSupported(address token) external view returns (bool configured) {
        return dataStore.getUint(Keys.pythFeedIdKey(token)) != 0;
    }
    
    /**
     * @dev Get feed ID for a token
     * @param token Token address
     * @return feedId Pyth feed ID
     */
    function getTokenFeedId(address token) external view returns (uint32 feedId) {
        return uint32(dataStore.getUint(Keys.pythFeedIdKey(token)));
    }
    
    /**
     * @dev Get stored price data for a token
     * @param token Token address
     * @return price The stored price (30 decimals)
     * @return confidence The stored confidence (30 decimals)
     * @return publishTime The publish timestamp
     * @return isValid Whether the stored data is valid
     */
    function getStoredPrice(address token) external view returns (
        uint256 price,
        uint256 confidence,
        uint256 publishTime,
        bool isValid
    ) {
        PythPriceData memory data = storedPrices[token];
        return (data.price, data.confidence, data.publishTime, data.isValid);
    }
}
