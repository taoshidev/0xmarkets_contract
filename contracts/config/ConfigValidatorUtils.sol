// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../error/Errors.sol";
import "../utils/Precision.sol";

// @title ConfigValidatorUtils
// @dev Library that range-checks values being written through Config's generic
// uint setter. Lifted from Config to keep Config under the EVM 24,576-byte
// contract size limit. Pure validation — no behavior change.
library ConfigValidatorUtils {
    // 0.00001% per second, ~315% per year
    uint256 internal constant MAX_ALLOWED_MAX_FUNDING_FACTOR_PER_SECOND = 100000000000000000000000;
    // at this rate max allowed funding rate will be reached in 1 hour at 100% imbalance if max funding rate is 315%
    uint256 internal constant MAX_ALLOWED_FUNDING_INCREASE_FACTOR_PER_SECOND =
        MAX_ALLOWED_MAX_FUNDING_FACTOR_PER_SECOND / 1 hours;
    // at this rate zero funding rate will be reached in 24 hours if max funding rate is 315%
    uint256 internal constant MAX_ALLOWED_FUNDING_DECREASE_FACTOR_PER_SECOND =
        MAX_ALLOWED_MAX_FUNDING_FACTOR_PER_SECOND / 24 hours;

    // @dev validate that the value being set is within the allowed range for
    //      the given baseKey. Reverts with ConfigValueExceedsAllowedRange on
    //      out-of-bounds values. Reads dataStore for cross-parameter checks
    //      (e.g. min/max funding factor pair).
    function validateRange(
        DataStore dataStore,
        bytes32 baseKey,
        bytes memory data,
        uint256 value
    ) external view {
        if (baseKey == Keys.SEQUENCER_GRACE_DURATION) {
            // 2 hours
            if (value > 7200) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (baseKey == Keys.MAX_FUNDING_FACTOR_PER_SECOND) {
            if (value > MAX_ALLOWED_MAX_FUNDING_FACTOR_PER_SECOND) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }

            bytes32 minFundingFactorPerSecondKey = Keys.getFullKey(Keys.MIN_FUNDING_FACTOR_PER_SECOND, data);
            uint256 minFundingFactorPerSecond = dataStore.getUint(minFundingFactorPerSecondKey);
            if (value < minFundingFactorPerSecond) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (baseKey == Keys.MIN_FUNDING_FACTOR_PER_SECOND) {
            bytes32 maxFundingFactorPerSecondKey = Keys.getFullKey(Keys.MAX_FUNDING_FACTOR_PER_SECOND, data);
            uint256 maxFundingFactorPerSecond = dataStore.getUint(maxFundingFactorPerSecondKey);
            if (value > maxFundingFactorPerSecond) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (baseKey == Keys.FUNDING_INCREASE_FACTOR_PER_SECOND) {
            if (value > MAX_ALLOWED_FUNDING_INCREASE_FACTOR_PER_SECOND) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (baseKey == Keys.FUNDING_DECREASE_FACTOR_PER_SECOND) {
            if (value > MAX_ALLOWED_FUNDING_DECREASE_FACTOR_PER_SECOND) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (baseKey == Keys.BORROWING_FACTOR || baseKey == Keys.BASE_BORROWING_FACTOR) {
            // 0.000005% per second, ~157% per year at 100% utilization
            if (value > 50000000000000000000000) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (baseKey == Keys.ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR) {
            // 0.00001% per second, ~315% per year at 100% utilization
            if (value > 100000000000000000000000) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (baseKey == Keys.FUNDING_EXPONENT_FACTOR || baseKey == Keys.BORROWING_EXPONENT_FACTOR) {
            // revert if value > 2
            if (value > 2 * Precision.FLOAT_PRECISION) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (baseKey == Keys.POSITION_IMPACT_EXPONENT_FACTOR || baseKey == Keys.SWAP_IMPACT_EXPONENT_FACTOR) {
            // revert if value > 3
            if (value > 3 * Precision.FLOAT_PRECISION) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (
            baseKey == Keys.FUNDING_FACTOR ||
            baseKey == Keys.BORROWING_FACTOR ||
            baseKey == Keys.FUNDING_INCREASE_FACTOR_PER_SECOND ||
            baseKey == Keys.FUNDING_DECREASE_FACTOR_PER_SECOND
        ) {
            // revert if value > 1%
            if (value > (1 * Precision.FLOAT_PRECISION) / 100) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (
            baseKey == Keys.SWAP_FEE_FACTOR ||
            baseKey == Keys.DEPOSIT_FEE_FACTOR ||
            baseKey == Keys.WITHDRAWAL_FEE_FACTOR ||
            baseKey == Keys.POSITION_FEE_FACTOR ||
            baseKey == Keys.MAX_UI_FEE_FACTOR ||
            baseKey == Keys.ATOMIC_SWAP_FEE_FACTOR ||
            baseKey == Keys.ATOMIC_WITHDRAWAL_FEE_FACTOR ||
            baseKey == Keys.BUYBACK_MAX_PRICE_IMPACT_FACTOR
        ) {
            // revert if value > 5%
            if (value > (5 * Precision.FLOAT_PRECISION) / 100) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        // if (baseKey == Keys.LIQUIDATION_FEE_FACTOR) {
        //     // revert if value > 1%
        //     if (value > Precision.FLOAT_PRECISION / 100) {
        //         revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
        //     }
        // }

        if (baseKey == Keys.MIN_COLLATERAL_USD) {
            // revert if value > 10 USD
            if (value > 10 * Precision.FLOAT_PRECISION) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (
            baseKey == Keys.POSITION_FEE_VEALPHA_FACTOR ||
            baseKey == Keys.POSITION_FEE_TREASURY_FACTOR ||
            baseKey == Keys.POSITION_FEE_BUYBACK_FACTOR ||
            baseKey == Keys.LIQUIDATION_FEE_VALIDATOR_FACTOR ||
            baseKey == Keys.LIQUIDATION_FEE_INSURANCE_FACTOR ||
            baseKey == Keys.MAX_PNL_FACTOR ||
            baseKey == Keys.MIN_PNL_FACTOR_AFTER_ADL ||
            baseKey == Keys.OPTIMAL_USAGE_FACTOR ||
            baseKey == Keys.PRO_DISCOUNT_FACTOR ||
            baseKey == Keys.BUYBACK_GMX_FACTOR ||
            baseKey == Keys.DATA_STREAM_SPREAD_REDUCTION_FACTOR
        ) {
            // revert if value > 100%
            if (value > Precision.FLOAT_PRECISION) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (baseKey == Keys.MAX_EXECUTION_FEE_MULTIPLIER_FACTOR) {
            if (value < Precision.FLOAT_PRECISION * 10 || value > Precision.FLOAT_PRECISION * 100_000) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }
    }
}
