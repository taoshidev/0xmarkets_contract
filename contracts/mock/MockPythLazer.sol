// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

/**
 * @title MockPythLazer
 * @dev Mock implementation of PythLazer for testing
 * Simulates the verifyUpdate function and fee handling
 */
contract MockPythLazer {
    uint256 public verification_fee;
    
    // Mock payload data for testing
    mapping(uint32 => bytes) public mockPayloads;
    mapping(address => bool) public validSigners;
    
    // Events for testing
    event UpdateVerified(address indexed caller, uint256 feeUsed, bytes payload);
    event FeeRefunded(address indexed caller, uint256 refundAmount);
    
    constructor() {
        verification_fee = 1 wei; // Default fee
        
        // Set up some valid signers for testing
        validSigners[address(0x1)] = true;
        validSigners[address(0x2)] = true;
    }
    
    /**
     * @dev Set verification fee for testing
     */
    function setVerificationFee(uint256 _fee) external {
        verification_fee = _fee;
    }
    
    /**
     * @dev Add a valid signer for testing
     */
    function addValidSigner(address signer) external {
        validSigners[signer] = true;
    }
    
    /**
     * @dev Set mock payload for a specific feed ID
     */
    function setMockPayload(uint32 feedId, bytes calldata payload) external {
        mockPayloads[feedId] = payload;
    }
    
    /**
     * @dev Mock implementation of verifyUpdate
     * Returns predefined payload based on the update data
     */
    function verifyUpdate(
        bytes calldata update
    ) external payable returns (bytes memory payload, address signer) {
        // Require fee and refund excess
        require(msg.value >= verification_fee, "Insufficient fee provided");
        
        uint256 actualFee = verification_fee;
        if (msg.value > verification_fee) {
            uint256 refund = msg.value - verification_fee;
            payable(msg.sender).transfer(refund);
            emit FeeRefunded(msg.sender, refund);
        }
        
        // For testing, extract feed ID from update data
        // In real implementation, this would parse the signed update
        require(update.length >= 4, "Update too short");
        
        // Extract feed ID from first 4 bytes of update data
        uint32 feedId = uint32(bytes4(update[0:4]));
        
        // Return mock payload for this feed ID
        payload = mockPayloads[feedId];
        require(payload.length > 0, "No mock payload configured for feed");
        
        // Return mock signer (for testing we use address(0x1))
        signer = address(0x1);
        require(validSigners[signer], "Invalid signer");
        
        emit UpdateVerified(msg.sender, actualFee, payload);
        
        return (payload, signer);
    }
    
    /**
     * @dev Check if signer is valid (for testing)
     */
    function isValidSigner(address signer) external view returns (bool) {
        return validSigners[signer];
    }
    
    /**
     * @dev Helper to create mock Pyth payload for testing
     * Creates a simple payload with one price feed that matches PythLazerLib expectations
     */
    function createMockPythPayload(
        uint32 feedId,
        uint64 price,
        uint64 confidence,
        int16 exponent,
        uint64 timestamp
    ) external pure returns (bytes memory) {
        // Create a Pyth Lazer payload that matches the expected format
        // Based on PythLazerLib parsing expectations
        
        bytes memory payload;
        
        // Payload header with proper magic number and structure
        // PythLazerLib expects specific magic bytes and format
        payload = abi.encodePacked(
            uint32(2479346549),  // Magic number from PythLazerLib.FORMAT_MAGIC
            uint64(timestamp),   // 8 bytes - timestamp
            uint8(1),            // 1 byte - channel (RealTime = 1)
            uint8(1)             // 1 byte - feeds length
        );
        
        // Feed header
        payload = abi.encodePacked(
            payload,
            feedId,              // 4 bytes - feed ID
            uint8(4)             // 1 byte - number of properties (Price, BestBid, BestAsk, Exponent)
        );
        
        // Price property
        payload = abi.encodePacked(
            payload,
            uint8(0),            // Price property type
            price                // 8 bytes - price value
        );
        
        // BestBidPrice property (use price - confidence as bid)
        uint64 bidPrice = confidence < price ? price - confidence : price / 2;
        payload = abi.encodePacked(
            payload,
            uint8(1),            // BestBidPrice property type
            bidPrice             // 8 bytes - bid price
        );
        
        // BestAskPrice property (use price + confidence as ask)
        uint64 askPrice = price + confidence;
        payload = abi.encodePacked(
            payload,
            uint8(2),            // BestAskPrice property type
            askPrice             // 8 bytes - ask price
        );
        
        // Exponent property
        payload = abi.encodePacked(
            payload,
            uint8(4),            // Exponent property type
            exponent             // 2 bytes - exponent
        );
        
        return payload;
    }
    
    /**
     * @dev Helper to create update data that will return the specified payload
     */
    function createMockUpdateData(uint32 feedId) external pure returns (bytes memory) {
        // Simple update data - just the feed ID for our mock
        return abi.encodePacked(feedId);
    }
}
