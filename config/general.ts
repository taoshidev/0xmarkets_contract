import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { decimalToFloat, expandDecimals, percentageToFloat } from "../utils/math";

export default async function ({ network }: HardhatRuntimeEnvironment) {
  if (network.name === "hardhat") {
    // Note that this is only for the hardhat config, the config for all
    // other networks is separate from this
    return {
      veAlphaFeeReceiver: ethers.constants.AddressZero,
      treasuryFeeReceiver: ethers.constants.AddressZero,
      buybackFeeReceiver: ethers.constants.AddressZero,
      validatorFeeReceiver: ethers.constants.AddressZero,
      insuranceFundAddress: ethers.constants.AddressZero,
      holdingAddress: ethers.constants.AddressZero,
      sequencerUptimeFeed: ethers.constants.AddressZero,
      sequencerGraceDuration: 300,
      maxUiFeeFactor: decimalToFloat(5, 5), // 0.005%
      maxAutoCancelOrders: 6,
      maxTotalCallbackGasLimitForAutoCancelOrders: 3_000_000,
      minHandleExecutionErrorGas: 1_200_000,
      minHandleExecutionErrorGasToForward: 1_000_000,
      minAdditionalGasForExecution: 1_000_000,
      refundExecutionFeeGasLimit: 200_000,

      depositGasLimit: 0,
      withdrawalGasLimit: 0,
      shiftGasLimit: 2_500_000,

      singleSwapGasLimit: 0,
      increaseOrderGasLimit: 0,
      decreaseOrderGasLimit: 0,
      swapOrderGasLimit: 0,

      glvPerMarketGasLimit: 0,
      glvDepositGasLimit: 0,
      glvWithdrawalGasLimit: 0,
      glvShiftGasLimit: 0,

      tokenTransferGasLimit: 200_000,
      nativeTokenTransferGasLimit: 50_000,

      estimatedGasFeeBaseAmount: 0,
      estimatedGasPerOraclePrice: 0,
      estimatedGasFeeMultiplierFactor: 0,

      executionGasFeeBaseAmount: 0,
      executionGasPerOraclePrice: 0,
      executionGasFeeMultiplierFactor: 0,

      requestExpirationTime: 300,

      maxSwapPathLength: 5,
      maxCallbackGasLimit: 2_000_000,
      minCollateralUsd: decimalToFloat(1),

      minPositionSizeUsd: decimalToFloat(1),
      claimableCollateralTimeDivisor: 60 * 60,

      positionFeeVeAlphaFactor: 0,
      positionFeeTreasuryFactor: 0,
      positionFeeBuybackFactor: 0,
      liquidationFeeValidatorFactor: 0,
      liquidationFeeInsuranceFactor: 0,

      // Insurance fund epoch lifecycle. SettlementHandler enforces
      // `block.timestamp >= lastEpochStart + epochLength` before re-snapshot;
      // drawdown injection is disabled if `block.timestamp - lastEpochStart >
      // maxEpochAge` to guard against stale snapshots from missed keeper runs.
      insuranceFundEpochLength: 7 * 24 * 60 * 60, // 7 days
      insuranceFundMaxEpochAge: 8 * 24 * 60 * 60, // 8 days

      skipBorrowingFeeForSmallerSide: false,

      ignoreOpenInterestForUsageFactor: false,

      maxExecutionFeeMultiplierFactor: decimalToFloat(100),
    };
  }

  const generalConfig = {
    sequencerUptimeFeed: ethers.constants.AddressZero,
    sequencerGraceDuration: 300,
    maxUiFeeFactor: percentageToFloat("0.05%"),
    maxAutoCancelOrders: 6,
    maxTotalCallbackGasLimitForAutoCancelOrders: 5_000_000,
    minHandleExecutionErrorGas: 1_200_000,
    minHandleExecutionErrorGasToForward: 1_000_000, // measured gas required for an order cancellation: ~600,000
    minAdditionalGasForExecution: 1_000_000,
    refundExecutionFeeGasLimit: 200_000,

    depositGasLimit: 1_800_000,
    withdrawalGasLimit: 1_500_000,
    shiftGasLimit: 2_500_000,

    singleSwapGasLimit: 1_000_000, // measured gas required for a swap in a market increase order: ~600,000
    increaseOrderGasLimit: 4_000_000,
    decreaseOrderGasLimit: 4_000_000,
    swapOrderGasLimit: 3_000_000,

    glvPerMarketGasLimit: 100_000,
    glvDepositGasLimit: 2_000_000,
    glvWithdrawalGasLimit: 2_000_000,
    glvShiftGasLimit: 3_000_000,

    tokenTransferGasLimit: 200_000,
    nativeTokenTransferGasLimit: 50_000,

    estimatedGasFeeBaseAmount: 600_000,
    estimatedGasPerOraclePrice: 250_000,
    estimatedGasFeeMultiplierFactor: expandDecimals(1, 30), // 1x

    executionGasFeeBaseAmount: 600_000,
    executionGasPerOraclePrice: 250_000,
    executionGasFeeMultiplierFactor: expandDecimals(1, 30), // 1x

    requestExpirationTime: 300,

    maxSwapPathLength: 3,
    maxCallbackGasLimit: 2_000_000,
    minCollateralUsd: decimalToFloat(1),

    minPositionSizeUsd: decimalToFloat(1),
    claimableCollateralTimeDivisor: 60 * 60,

    positionFeeVeAlphaFactor: 0,
    positionFeeTreasuryFactor: 0,
    positionFeeBuybackFactor: 0,
    liquidationFeeValidatorFactor: 0,
    liquidationFeeInsuranceFactor: 0,

    // Insurance fund epoch lifecycle (seconds). See deploy/configureGeneralSettings.ts.
    insuranceFundEpochLength: 7 * 24 * 60 * 60, // 7 days
    insuranceFundMaxEpochAge: 8 * 24 * 60 * 60, // 8 days

    skipBorrowingFeeForSmallerSide: true,

    ignoreOpenInterestForUsageFactor: false,

    maxExecutionFeeMultiplierFactor: decimalToFloat(100),
  };

  const networkConfig = {
    base: {
      estimatedGasFeeBaseAmount: false,
      estimatedGasPerOraclePrice: false,
      executionGasFeeBaseAmount: false,
      executionGasPerOraclePrice: false,
      veAlphaFeeReceiver: "REPLACE_ME",
      treasuryFeeReceiver: "REPLACE_ME",
      buybackFeeReceiver: "REPLACE_ME",
      validatorFeeReceiver: "REPLACE_ME",
      insuranceFundAddress: "REPLACE_ME",
      holdingAddress: "REPLACE_ME",
    },
    baseSepolia: {
      estimatedGasFeeBaseAmount: false,
      estimatedGasPerOraclePrice: false,
      executionGasFeeBaseAmount: false,
      executionGasPerOraclePrice: false,
      veAlphaFeeReceiver: "0x9724251d7DeC79FB5C41F31b2793892831Bf1200",
      treasuryFeeReceiver: "0x9724251d7DeC79FB5C41F31b2793892831Bf1200",
      buybackFeeReceiver: "0x9724251d7DeC79FB5C41F31b2793892831Bf1200",
      validatorFeeReceiver: "0x9724251d7DeC79FB5C41F31b2793892831Bf1200",
      insuranceFundAddress: "0x9724251d7DeC79FB5C41F31b2793892831Bf1200",
      holdingAddress: "0x9724251d7DeC79FB5C41F31b2793892831Bf1200",
    },
    localhost: {
      estimatedGasFeeBaseAmount: false,
      estimatedGasPerOraclePrice: false,
      executionGasFeeBaseAmount: false,
      executionGasPerOraclePrice: false,
      veAlphaFeeReceiver: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      treasuryFeeReceiver: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      buybackFeeReceiver: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      validatorFeeReceiver: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      insuranceFundAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      holdingAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    },
  }[network.name === "baseSepoliaFork" ? "baseSepolia" : network.name];

  if (!networkConfig) {
    throw new Error(`Network config not defined for ${network.name}`);
  }

  return { ...generalConfig, ...networkConfig };
}
