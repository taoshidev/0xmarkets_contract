// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../oracle/interfaces/IOracleProvider.sol";
import "../oracle/utils/OracleUtils.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../utils/Precision.sol";
import "../chain/Chain.sol";

/**
 * @title SignedPriceProvider
 * @dev Simple oracle provider for tests that validates signed prices
 * This is used in place of GMX's GmOracleProvider which was removed in 0xMarket
 */
contract SignedPriceProvider is IOracleProvider {
    DataStore public immutable dataStore;

    struct SignedPriceData {
        address token;
        uint256 signerInfo;
        uint256 precision;
        uint256 minOracleBlockNumber;
        uint256 maxOracleBlockNumber;
        uint256 oracleTimestamp;
        bytes32 blockHash;
        uint256[] signedMinPrices;
        uint256[] signedMaxPrices;
        bytes[] signatures;
    }

    constructor(DataStore _dataStore) {
        dataStore = _dataStore;
    }

    function getOraclePrice(address token, bytes memory data)
        external
        view
        override
        returns (OracleUtils.ValidatedPrice memory)
    {
        require(data.length > 0, "SignedPriceProvider: empty data");
        
        // Decode the signed price data using a struct to avoid stack too deep
        SignedPriceData memory priceData = abi.decode(data, (SignedPriceData));

        require(priceData.token == token, "SignedPriceProvider: token mismatch");
        require(priceData.signatures.length > 0, "SignedPriceProvider: no signatures");
        require(priceData.signedMinPrices.length > 0, "SignedPriceProvider: no prices");
        require(priceData.precision <= 77, "SignedPriceProvider: precision too high");

        // For simplicity in tests, just use the median price and convert to 30 decimals
        uint256 medianIndex = priceData.signatures.length / 2;
        uint256 minPrice = priceData.signedMinPrices[medianIndex];
        uint256 maxPrice = priceData.signedMaxPrices[medianIndex];
        
        // Expand precision safely
        for (uint256 i = 0; i < priceData.precision; i++) {
            minPrice = minPrice * 10;
            maxPrice = maxPrice * 10;
        }
        
        return OracleUtils.ValidatedPrice({
            token: token,
            min: minPrice,
            max: maxPrice,
            timestamp: priceData.oracleTimestamp,
            provider: address(this)
        });
    }
}