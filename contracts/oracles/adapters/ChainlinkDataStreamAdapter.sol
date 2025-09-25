// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../data/DataStore.sol";
import "../../data/Keys.sol";
import "../interfaces/IOracleProvider.sol";
import "../interfaces/IChainlinkDataStreamVerifier.sol";
import "../../utils/Precision.sol";
import "../../chain/Chain.sol";
import "../../error/Errors.sol";

/**
 * @title ChainlinkDataStreamAdapter
 * @dev V2 adapter for Chainlink Data Streams with bid/ask spreads
 * Will be used when Data Streams become available on Base chain
 * Provides enhanced price data with liquidity depth information
 */
contract ChainlinkDataStreamAdapter is IOracleProvider {
    
    DataStore public immutable dataStore;
    address public immutable oracle;
    IChainlinkDataStreamVerifier public immutable verifier;
    
    // Data Streams Report Structure
    struct Report {
        bytes32 feedId; // The feed ID the report has data for
        uint32 validFromTimestamp; // Earliest timestamp for which price is applicable
        uint32 observationsTimestamp; // Latest timestamp for which price is applicable
        uint192 nativeFee; // Base cost to validate a transaction using the report, denominated in the chain's native token (WETH/ETH)
        uint192 linkFee; // Base cost to validate a transaction using the report, denominated in LINK
        uint32 expiresAt; // Latest timestamp where the report can be verified onchain
        int192 price; // DON consensus median price, carried to 8 decimal places
        int192 bid; // Simulated price impact of a buy order up to the X% depth of liquidity utilisation
        int192 ask; // Simulated price impact of a sell order up to the X% depth of liquidity utilisation
    }

    // Events
    event DataStreamPriceUpdated(
        address indexed token,
        bytes32 indexed feedId,
        uint256 price,
        uint256 bid,
        uint256 ask,
        uint256 timestamp
    );

    modifier onlyOracle() {
        if (msg.sender != oracle) {
            revert Errors.Unauthorized(msg.sender, "Oracle");
        }
        _;
    }

    constructor(
        DataStore _dataStore,
        address _oracle,
        IChainlinkDataStreamVerifier _verifier
    ) {
        dataStore = _dataStore;
        oracle = _oracle;
        verifier = _verifier;
    }

    /**
     * @dev Get oracle price from Chainlink Data Streams
     * @param token The token to get price for
     * @param data The Data Streams update payload
     * @return ValidatedPrice struct with bid/ask spreads
     */
    function getOraclePrice(
        address token,
        bytes memory data
    ) external onlyOracle returns (OracleUtils.ValidatedPrice memory) {
        
        // Get configured feed ID for this token
        bytes32 feedId = dataStore.getBytes32(Keys.dataStreamIdKey(token));
        if (feedId == bytes32(0)) {
            revert Errors.EmptyDataStreamFeedId(token);
        }

        // Verify the Data Streams payload
        bytes memory payloadParameter = _getPayloadParameter();
        bytes memory verifierResponse = verifier.verify(data, payloadParameter);
        Report memory report = abi.decode(verifierResponse, (Report));

        // Validate feed ID matches
        if (feedId != report.feedId) {
            revert Errors.InvalidDataStreamFeedId(token, report.feedId, feedId);
        }

        // Validate price data
        if (report.bid <= 0 || report.ask <= 0) {
            revert Errors.InvalidDataStreamPrices(token, report.bid, report.ask);
        }

        if (report.bid > report.ask) {
            revert Errors.InvalidDataStreamBidAsk(token, report.bid, report.ask);
        }

        // Check for stale data
        uint256 maxAge = dataStore.getUint(Keys.MAX_ORACLE_PRICE_AGE);
        if (Chain.currentTimestamp() > report.observationsTimestamp && 
            Chain.currentTimestamp() - report.observationsTimestamp > maxAge) {
            revert Errors.MaxPriceAgeExceeded(report.observationsTimestamp, Chain.currentTimestamp());
        }

        // Convert and return validated price with bid/ask spreads
        return _buildValidatedPrice(token, report);
    }

    /**
     * @dev Build validated price struct from Data Streams report
     * @param token The token address
     * @param report The Data Streams report
     * @return ValidatedPrice struct with bid/ask spreads
     */
    function _buildValidatedPrice(
        address token,
        Report memory report
    ) internal returns (OracleUtils.ValidatedPrice memory) {
        // Get precision multiplier for this token
        uint256 precision = _getDataStreamMultiplier(token);
        
        // Convert bid/ask prices to correct precision (30 decimals)
        uint256 adjustedBidPrice = Precision.mulDiv(uint256(uint192(report.bid)), precision, Precision.FLOAT_PRECISION);
        uint256 adjustedAskPrice = Precision.mulDiv(uint256(uint192(report.ask)), precision, Precision.FLOAT_PRECISION);
        uint256 adjustedPrice = Precision.mulDiv(uint256(uint192(report.price)), precision, Precision.FLOAT_PRECISION);

        // Apply spread reduction if configured
        uint256 spreadReductionFactor = _getDataStreamSpreadReductionFactor(token);
        if (spreadReductionFactor != 0) {
            // Reduce spread by configured factor
            if (spreadReductionFactor == Precision.FLOAT_PRECISION) {
                // Full reduction - use median price for both min/max
                adjustedBidPrice = (adjustedAskPrice + adjustedBidPrice) / 2;
                adjustedAskPrice = adjustedBidPrice;
            } else {
                // Partial reduction
                uint256 halfSpread = (adjustedAskPrice - adjustedBidPrice) / 2;
                adjustedBidPrice = adjustedBidPrice + Precision.applyFactor(halfSpread, spreadReductionFactor);
                adjustedAskPrice = adjustedAskPrice - Precision.applyFactor(halfSpread, spreadReductionFactor);
            }
        }

        emit DataStreamPriceUpdated(
            token, 
            report.feedId, 
            adjustedPrice, 
            adjustedBidPrice, 
            adjustedAskPrice, 
            report.observationsTimestamp
        );

        return OracleUtils.ValidatedPrice({
            token: token,
            min: adjustedBidPrice,    // Use bid as min price
            max: adjustedAskPrice,    // Use ask as max price
            timestamp: report.observationsTimestamp,
            provider: address(this)
        });
    }

    /**
     * @dev Get Data Streams multiplier for precision adjustment
     * @param token The token address
     * @return multiplier The precision multiplier
     */
    function _getDataStreamMultiplier(address token) internal view returns (uint256) {
        uint256 multiplier = dataStore.getUint(Keys.dataStreamMultiplierKey(token));
        
        if (multiplier == 0) {
            revert Errors.EmptyDataStreamMultiplier(token);
        }

        return multiplier;
    }

    /**
     * @dev Get Data Streams spread reduction factor
     * @param token The token address
     * @return factor The spread reduction factor
     */
    function _getDataStreamSpreadReductionFactor(address token) internal view returns (uint256) {
        uint256 spreadReductionFactor = dataStore.getUint(Keys.dataStreamSpreadReductionFactorKey(token));
        if (spreadReductionFactor > Precision.FLOAT_PRECISION) {
            revert Errors.InvalidDataStreamSpreadReductionFactor(token, spreadReductionFactor);
        }
        return spreadReductionFactor;
    }

    /**
     * @dev Get payload parameter for Data Streams verification
     * @return payloadParameter The encoded payload parameter
     */
    function _getPayloadParameter() internal view returns (bytes memory) {
        // LINK token address for fee payment
        address feeToken = dataStore.getAddress(Keys.CHAINLINK_PAYMENT_TOKEN);
        if (feeToken == address(0)) {
            revert Errors.EmptyChainlinkPaymentToken();
        }
        return abi.encode(feeToken);
    }

    // ========== VIEW FUNCTIONS ==========

    /**
     * @dev Get the Data Streams feed ID for a token
     * @param token The token address
     * @return feedId The Data Streams feed ID
     */
    function getDataStreamFeedId(address token) external view returns (bytes32 feedId) {
        return dataStore.getBytes32(Keys.dataStreamIdKey(token));
    }

    /**
     * @dev Check if this adapter supports a token
     * @param token The token address
     * @return supported True if Data Streams feed is configured
     */
    function supportsToken(address token) external view returns (bool supported) {
        return dataStore.getBytes32(Keys.dataStreamIdKey(token)) != bytes32(0);
    }

    /**
     * @dev Get the verifier contract address
     * @return verifierAddress The Data Streams verifier address
     */
    function getVerifierAddress() external view returns (address verifierAddress) {
        return address(verifier);
    }
}
