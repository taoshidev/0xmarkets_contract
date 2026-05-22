// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";

// @title ConfigAllowedKeys
// @dev Library that initializes the `allowedBaseKeys` whitelist used by Config.
// Lifted from Config to keep Config under the EVM 24,576-byte contract size
// limit. Pure storage init — no behavior change.
library ConfigAllowedKeys {
    // @dev populates the allowedBaseKeys mapping with every base key that the
    //      generic Config setters (setBool / setAddress / setUint / setInt /
    //      setBytes32) are permitted to write to. Called once from Config's
    //      constructor with a storage pointer to its mapping.
    function initAllowedBaseKeys(mapping(bytes32 => bool) storage allowedBaseKeys) internal {
        allowedBaseKeys[Keys.HOLDING_ADDRESS] = true;

        allowedBaseKeys[Keys.MIN_HANDLE_EXECUTION_ERROR_GAS] = true;
        allowedBaseKeys[Keys.MIN_HANDLE_EXECUTION_ERROR_GAS_TO_FORWARD] = true;
        allowedBaseKeys[Keys.MIN_ADDITIONAL_GAS_FOR_EXECUTION] = true;

        allowedBaseKeys[Keys.IS_MARKET_DISABLED] = true;

        allowedBaseKeys[Keys.MAX_SWAP_PATH_LENGTH] = true;
        allowedBaseKeys[Keys.MAX_CALLBACK_GAS_LIMIT] = true;
        allowedBaseKeys[Keys.REFUND_EXECUTION_FEE_GAS_LIMIT] = true;

        allowedBaseKeys[Keys.MIN_POSITION_SIZE_USD] = true;
        allowedBaseKeys[Keys.MAX_POSITION_IMPACT_FACTOR_FOR_LIQUIDATIONS] = true;

        allowedBaseKeys[Keys.MAX_POOL_AMOUNT] = true;
        allowedBaseKeys[Keys.MAX_POOL_USD_FOR_DEPOSIT] = true;
        allowedBaseKeys[Keys.MAX_OPEN_INTEREST] = true;

        allowedBaseKeys[Keys.MIN_MARKET_TOKENS_FOR_FIRST_DEPOSIT] = true;

        allowedBaseKeys[Keys.CREATE_DEPOSIT_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.CANCEL_DEPOSIT_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.EXECUTE_DEPOSIT_FEATURE_DISABLED] = true;

        allowedBaseKeys[Keys.CREATE_WITHDRAWAL_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.CANCEL_WITHDRAWAL_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.EXECUTE_WITHDRAWAL_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.EXECUTE_ATOMIC_WITHDRAWAL_FEATURE_DISABLED] = true;

        allowedBaseKeys[Keys.CREATE_SHIFT_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.CANCEL_SHIFT_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.EXECUTE_SHIFT_FEATURE_DISABLED] = true;

        allowedBaseKeys[Keys.CREATE_ORDER_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.EXECUTE_ORDER_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.EXECUTE_ADL_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.UPDATE_ORDER_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.CANCEL_ORDER_FEATURE_DISABLED] = true;

        allowedBaseKeys[Keys.CREATE_GLV_DEPOSIT_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.CANCEL_GLV_DEPOSIT_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.EXECUTE_GLV_DEPOSIT_FEATURE_DISABLED] = true;

        allowedBaseKeys[Keys.CREATE_GLV_WITHDRAWAL_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.CANCEL_GLV_WITHDRAWAL_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.EXECUTE_GLV_WITHDRAWAL_FEATURE_DISABLED] = true;

        allowedBaseKeys[Keys.CREATE_GLV_SHIFT_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.EXECUTE_GLV_SHIFT_FEATURE_DISABLED] = true;

        allowedBaseKeys[Keys.CLAIM_FUNDING_FEES_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.CLAIM_COLLATERAL_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.CLAIM_AFFILIATE_REWARDS_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.CLAIM_UI_FEES_FEATURE_DISABLED] = true;

        allowedBaseKeys[Keys.MIN_AFFILIATE_REWARD_FACTOR] = true;

        allowedBaseKeys[Keys.SUBACCOUNT_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.GASLESS_FEATURE_DISABLED] = true;

        allowedBaseKeys[Keys.MIN_ORACLE_BLOCK_CONFIRMATIONS] = true;
        allowedBaseKeys[Keys.MAX_ORACLE_PRICE_AGE] = true;
        allowedBaseKeys[Keys.MAX_ORACLE_TIMESTAMP_RANGE] = true;
        allowedBaseKeys[Keys.ORACLE_TIMESTAMP_ADJUSTMENT] = true;
        allowedBaseKeys[Keys.CHAINLINK_PAYMENT_TOKEN] = true;
        allowedBaseKeys[Keys.SEQUENCER_GRACE_DURATION] = true;
        allowedBaseKeys[Keys.MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR] = true;

        allowedBaseKeys[Keys.POSITION_FEE_VEALPHA_FACTOR] = true;
        allowedBaseKeys[Keys.POSITION_FEE_TREASURY_FACTOR] = true;
        allowedBaseKeys[Keys.POSITION_FEE_BUYBACK_FACTOR] = true;
        allowedBaseKeys[Keys.LIQUIDATION_FEE_VALIDATOR_FACTOR] = true;
        allowedBaseKeys[Keys.LIQUIDATION_FEE_INSURANCE_FACTOR] = true;

        // Insurance fund — governance-tunable parameters.
        // INSURANCE_FUND_ADDRESS and LIQUIDATION_FEE_INSURANCE_FACTOR are registered
        // above by fee-addresses (PR #31). Storage keys for the fund (balance, epoch
        // snapshot, epoch start) are NOT registered here: balances are written by
        // InsuranceFundUtils on each close + snapshot, not by governance. Those
        // keys live in EXCLUDED_CONFIG_KEYS in utils/config.ts.
        allowedBaseKeys[Keys.INSURANCE_FUND_DRAWDOWN_TRIGGER_FACTOR] = true;
        allowedBaseKeys[Keys.INSURANCE_FUND_MAX_EPOCH_AGE] = true;
        allowedBaseKeys[Keys.INSURANCE_FUND_EPOCH_LENGTH] = true;

        allowedBaseKeys[Keys.ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1] = true;
        allowedBaseKeys[Keys.ESTIMATED_GAS_FEE_PER_ORACLE_PRICE] = true;
        allowedBaseKeys[Keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR] = true;

        allowedBaseKeys[Keys.EXECUTION_GAS_FEE_BASE_AMOUNT_V2_1] = true;
        allowedBaseKeys[Keys.EXECUTION_GAS_FEE_PER_ORACLE_PRICE] = true;
        allowedBaseKeys[Keys.EXECUTION_GAS_FEE_MULTIPLIER_FACTOR] = true;

        allowedBaseKeys[Keys.MAX_EXECUTION_FEE_MULTIPLIER_FACTOR] = true;

        allowedBaseKeys[Keys.DEPOSIT_GAS_LIMIT] = true;
        allowedBaseKeys[Keys.WITHDRAWAL_GAS_LIMIT] = true;
        allowedBaseKeys[Keys.GLV_DEPOSIT_GAS_LIMIT] = true;
        allowedBaseKeys[Keys.GLV_WITHDRAWAL_GAS_LIMIT] = true;
        allowedBaseKeys[Keys.GLV_SHIFT_GAS_LIMIT] = true;
        allowedBaseKeys[Keys.GLV_PER_MARKET_GAS_LIMIT] = true;
        allowedBaseKeys[Keys.SHIFT_GAS_LIMIT] = true;
        allowedBaseKeys[Keys.SINGLE_SWAP_GAS_LIMIT] = true;
        allowedBaseKeys[Keys.INCREASE_ORDER_GAS_LIMIT] = true;
        allowedBaseKeys[Keys.DECREASE_ORDER_GAS_LIMIT] = true;
        allowedBaseKeys[Keys.SWAP_ORDER_GAS_LIMIT] = true;
        allowedBaseKeys[Keys.TOKEN_TRANSFER_GAS_LIMIT] = true;
        allowedBaseKeys[Keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT] = true;

        allowedBaseKeys[Keys.REQUEST_EXPIRATION_TIME] = true;
        allowedBaseKeys[Keys.MAX_LEVERAGE] = true;
        allowedBaseKeys[Keys.MIN_LEVERAGE] = true;
        allowedBaseKeys[Keys.MIN_MMR] = true;
        allowedBaseKeys[Keys.MAX_MMR] = true;
        allowedBaseKeys[Keys.MMR_TUNING] = true;
        allowedBaseKeys[Keys.MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER] = true;
        allowedBaseKeys[Keys.MIN_COLLATERAL_USD] = true;

        allowedBaseKeys[Keys.VIRTUAL_TOKEN_ID] = true;
        allowedBaseKeys[Keys.VIRTUAL_MARKET_ID] = true;
        allowedBaseKeys[Keys.VIRTUAL_INVENTORY_FOR_SWAPS] = true;
        allowedBaseKeys[Keys.VIRTUAL_INVENTORY_FOR_POSITIONS] = true;

        allowedBaseKeys[Keys.POSITION_IMPACT_FACTOR] = true;
        allowedBaseKeys[Keys.POSITION_IMPACT_EXPONENT_FACTOR] = true;
        allowedBaseKeys[Keys.MAX_POSITION_IMPACT_FACTOR] = true;
        allowedBaseKeys[Keys.POSITION_FEE_FACTOR] = true;
        allowedBaseKeys[Keys.PRO_DISCOUNT_FACTOR] = true;
        allowedBaseKeys[Keys.PRO_TRADER_TIER] = true;
        allowedBaseKeys[Keys.LIQUIDATION_FEE_FACTOR] = true;

        allowedBaseKeys[Keys.SWAP_IMPACT_FACTOR] = true;
        allowedBaseKeys[Keys.SWAP_IMPACT_EXPONENT_FACTOR] = true;
        allowedBaseKeys[Keys.SWAP_FEE_FACTOR] = true;
        allowedBaseKeys[Keys.DEPOSIT_FEE_FACTOR] = true;
        allowedBaseKeys[Keys.WITHDRAWAL_FEE_FACTOR] = true;
        allowedBaseKeys[Keys.ATOMIC_SWAP_FEE_FACTOR] = true;
        allowedBaseKeys[Keys.ATOMIC_WITHDRAWAL_FEE_FACTOR] = true;

        allowedBaseKeys[Keys.MAX_UI_FEE_FACTOR] = true;
        allowedBaseKeys[Keys.MAX_AUTO_CANCEL_ORDERS] = true;
        allowedBaseKeys[Keys.MAX_TOTAL_CALLBACK_GAS_LIMIT_FOR_AUTO_CANCEL_ORDERS] = true;

        allowedBaseKeys[Keys.ORACLE_TYPE] = true;

        allowedBaseKeys[Keys.RESERVE_FACTOR] = true;
        allowedBaseKeys[Keys.OPEN_INTEREST_RESERVE_FACTOR] = true;

        allowedBaseKeys[Keys.MAX_PNL_FACTOR] = true;
        allowedBaseKeys[Keys.MIN_PNL_FACTOR_AFTER_ADL] = true;

        allowedBaseKeys[Keys.FUNDING_FACTOR] = true;
        allowedBaseKeys[Keys.FUNDING_EXPONENT_FACTOR] = true;
        allowedBaseKeys[Keys.FUNDING_INCREASE_FACTOR_PER_SECOND] = true;
        allowedBaseKeys[Keys.FUNDING_DECREASE_FACTOR_PER_SECOND] = true;
        allowedBaseKeys[Keys.MIN_FUNDING_FACTOR_PER_SECOND] = true;
        allowedBaseKeys[Keys.MAX_FUNDING_FACTOR_PER_SECOND] = true;
        allowedBaseKeys[Keys.THRESHOLD_FOR_STABLE_FUNDING] = true;
        allowedBaseKeys[Keys.THRESHOLD_FOR_DECREASE_FUNDING] = true;

        allowedBaseKeys[Keys.IGNORE_OPEN_INTEREST_FOR_USAGE_FACTOR] = true;

        allowedBaseKeys[Keys.OPTIMAL_USAGE_FACTOR] = true;
        allowedBaseKeys[Keys.BASE_BORROWING_FACTOR] = true;
        allowedBaseKeys[Keys.ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR] = true;
        allowedBaseKeys[Keys.BORROWING_FACTOR] = true;
        allowedBaseKeys[Keys.BORROWING_EXPONENT_FACTOR] = true;
        allowedBaseKeys[Keys.SKIP_BORROWING_FEE_FOR_SMALLER_SIDE] = true;

        allowedBaseKeys[Keys.PRICE_FEED_HEARTBEAT_DURATION] = true;

        allowedBaseKeys[Keys.IS_GLV_MARKET_DISABLED] = true;
        allowedBaseKeys[Keys.GLV_MAX_MARKET_TOKEN_BALANCE_USD] = true;
        allowedBaseKeys[Keys.GLV_MAX_MARKET_TOKEN_BALANCE_AMOUNT] = true;
        allowedBaseKeys[Keys.GLV_SHIFT_MAX_PRICE_IMPACT_FACTOR] = true;
        allowedBaseKeys[Keys.GLV_SHIFT_MIN_INTERVAL] = true;
        allowedBaseKeys[Keys.MIN_GLV_TOKENS_FOR_FIRST_DEPOSIT] = true;
        allowedBaseKeys[Keys.GLV_MAX_MARKET_COUNT] = true;

        allowedBaseKeys[Keys.SYNC_CONFIG_FEATURE_DISABLED] = true;
        allowedBaseKeys[Keys.SYNC_CONFIG_MARKET_DISABLED] = true;
        allowedBaseKeys[Keys.SYNC_CONFIG_PARAMETER_DISABLED] = true;
        allowedBaseKeys[Keys.SYNC_CONFIG_MARKET_PARAMETER_DISABLED] = true;

        allowedBaseKeys[Keys.BUYBACK_BATCH_AMOUNT] = true;
        allowedBaseKeys[Keys.BUYBACK_GMX_FACTOR] = true;
        allowedBaseKeys[Keys.BUYBACK_MAX_PRICE_IMPACT_FACTOR] = true;
        allowedBaseKeys[Keys.BUYBACK_MAX_PRICE_AGE] = true;

        allowedBaseKeys[Keys.DATA_STREAM_INVERTED] = true;
        allowedBaseKeys[Keys.DATA_STREAM_SPREAD_REDUCTION_FACTOR] = true;

        allowedBaseKeys[Keys.BASELINE_SWAP_LONGS_PAY_SHORTS] = true;
        allowedBaseKeys[Keys.BASELINE_SWAP_PER_DAY] = true;

        allowedBaseKeys[Keys.PYTH_LAZER_FEED_ID] = true;
        allowedBaseKeys[Keys.PYTH_LAZER_FEED_INVERTED] = true;
        allowedBaseKeys[Keys.PYTH_LAZER_FEED_MULTIPLIER] = true;
    }
}
