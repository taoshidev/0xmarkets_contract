import { BigNumberish, ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_YEAR } from "../utils/constants";
import { bigNumberify, decimalToFloat, expandDecimals, exponentToFloat, percentageToFloat } from "../utils/math";

// Leverage ladder presets per asset class. Each tier caps max leverage as a function
// of post-trade notional (in USD with 30 decimals). Final tier's notional is MaxUint256
// (catch-all). Each tier's leverage must be ≤ the market's max_leverage.
const fxLeverageLadder = [
  { maxNotionalUsd: expandDecimals(50_000, 30), maxLeverage: decimalToFloat(200) },
  { maxNotionalUsd: expandDecimals(200_000, 30), maxLeverage: decimalToFloat(150) },
  { maxNotionalUsd: expandDecimals(500_000, 30), maxLeverage: decimalToFloat(100) },
  { maxNotionalUsd: expandDecimals(1_000_000, 30), maxLeverage: decimalToFloat(50) },
  { maxNotionalUsd: expandDecimals(2_500_000, 30), maxLeverage: decimalToFloat(25) },
  { maxNotionalUsd: ethers.constants.MaxUint256, maxLeverage: decimalToFloat(10) },
];

const goldLeverageLadder = [
  { maxNotionalUsd: expandDecimals(50_000, 30), maxLeverage: decimalToFloat(100) },
  { maxNotionalUsd: expandDecimals(200_000, 30), maxLeverage: decimalToFloat(75) },
  { maxNotionalUsd: expandDecimals(500_000, 30), maxLeverage: decimalToFloat(50) },
  { maxNotionalUsd: expandDecimals(1_000_000, 30), maxLeverage: decimalToFloat(25) },
  { maxNotionalUsd: expandDecimals(2_500_000, 30), maxLeverage: decimalToFloat(15) },
  { maxNotionalUsd: ethers.constants.MaxUint256, maxLeverage: decimalToFloat(5) },
];

const cryptoLeverageLadder = [
  { maxNotionalUsd: expandDecimals(25_000, 30), maxLeverage: decimalToFloat(50) },
  { maxNotionalUsd: expandDecimals(100_000, 30), maxLeverage: decimalToFloat(25) },
  { maxNotionalUsd: expandDecimals(250_000, 30), maxLeverage: decimalToFloat(15) },
  { maxNotionalUsd: expandDecimals(500_000, 30), maxLeverage: decimalToFloat(10) },
  { maxNotionalUsd: expandDecimals(1_000_000, 30), maxLeverage: decimalToFloat(5) },
  { maxNotionalUsd: ethers.constants.MaxUint256, maxLeverage: decimalToFloat(3) },
];

export type BaseMarketConfig = {
  reserveFactor: BigNumberish;
  reserveFactorLongs?: BigNumberish;
  reserveFactorShorts?: BigNumberish;

  openInterestReserveFactor?: BigNumberish;
  openInterestReserveFactorLongs?: BigNumberish;
  openInterestReserveFactorShorts?: BigNumberish;

  minCollateralFactorForOpenInterestMultiplier?: BigNumberish;
  minCollateralFactorForOpenInterestMultiplierLong?: BigNumberish;
  minCollateralFactorForOpenInterestMultiplierShort?: BigNumberish;

  // Dynamic MMR parameters. mmr = clamp((sizeInUsd/collateralUsd)/maxLeverage * mmrTuning, minMmr, maxMmr)
  maxLeverage?: BigNumberish;
  minLeverage?: BigNumberish;
  minMmr?: BigNumberish;
  maxMmr?: BigNumberish;
  mmrTuning?: BigNumberish;

  // Leverage ladder. Each tier caps max leverage as a function of post-trade notional.
  // Tiers must be sorted strictly ascending by maxNotionalUsd. maxLeverages must be
  // non-increasing. The final tier's maxNotionalUsd must equal MaxUint256 (catch-all).
  // Each maxLeverage must lie within [minLeverage, maxLeverage] for the market.
  leverageLadder?: { maxNotionalUsd: BigNumberish; maxLeverage: BigNumberish }[];

  maxLongTokenPoolAmount: BigNumberish;
  maxShortTokenPoolAmount: BigNumberish;

  maxPoolUsdForDeposit?: BigNumberish;
  maxLongTokenPoolUsdForDeposit?: BigNumberish;
  maxShortTokenPoolUsdForDeposit?: BigNumberish;

  maxOpenInterest?: BigNumberish;
  maxOpenInterestForLongs?: BigNumberish;
  maxOpenInterestForShorts?: BigNumberish;

  maxPnlFactorForTraders?: BigNumberish;
  maxPnlFactorForTradersLongs?: BigNumberish;
  maxPnlFactorForTradersShorts?: BigNumberish;

  maxPnlFactorForAdl?: BigNumberish;
  maxPnlFactorForAdlLongs?: BigNumberish;
  maxPnlFactorForAdlShorts?: BigNumberish;

  minPnlFactorAfterAdl?: BigNumberish;
  minPnlFactorAfterAdlLongs?: BigNumberish;
  minPnlFactorAfterAdlShorts?: BigNumberish;

  // In GLV there may be GM markets which are above their maximum pnlToPoolFactorForTraders.
  // If this GM market's maxPnlFactorForDeposits is higher than maxPnlFactorForTraders
  // then the GM market is valued lower during deposits than it will be once traders
  // have realized their capped profits. Malicious user may observe a GM market
  // in such a condition and deposit into the GLV containing it in order to gain
  // from ADLs which will soon follow. To avoid this maxPnlFactorForDeposits should be
  // less than or equal to maxPnlFactorForTraders
  maxPnlFactorForDeposits?: BigNumberish;
  maxPnlFactorForDepositsLongs?: BigNumberish;
  maxPnlFactorForDepositsShorts?: BigNumberish;

  maxPnlFactorForWithdrawals?: BigNumberish;
  maxPnlFactorForWithdrawalsLongs?: BigNumberish;
  maxPnlFactorForWithdrawalsShorts?: BigNumberish;

  positionFeeFactorForPositiveImpact: BigNumberish;
  positionFeeFactorForNegativeImpact: BigNumberish;
  liquidationFeeFactor: BigNumberish;

  negativePositionImpactFactor: BigNumberish;
  positivePositionImpactFactor: BigNumberish;
  positionImpactExponentFactor: BigNumberish;

  negativeMaxPositionImpactFactor: BigNumberish;
  positiveMaxPositionImpactFactor: BigNumberish;
  maxPositionImpactFactorForLiquidations: BigNumberish;

  swapFeeFactorForPositiveImpact: BigNumberish;
  swapFeeFactorForNegativeImpact: BigNumberish;
  atomicSwapFeeFactor: BigNumberish;
  atomicWithdrawalFeeFactor: BigNumberish;

  negativeSwapImpactFactor: BigNumberish;
  positiveSwapImpactFactor: BigNumberish;
  swapImpactExponentFactor: BigNumberish;

  minCollateralUsd: BigNumberish;

  aboveOptimalUsageBorrowingFactor?: BigNumberish;
  aboveOptimalUsageBorrowingFactorForLongs?: BigNumberish;
  aboveOptimalUsageBorrowingFactorForShorts?: BigNumberish;

  baseBorrowingFactor?: BigNumberish;
  baseBorrowingFactorForLongs?: BigNumberish;
  baseBorrowingFactorForShorts?: BigNumberish;

  optimalUsageFactor?: BigNumberish;
  optimalUsageFactorForLongs?: BigNumberish;
  optimalUsageFactorForShorts?: BigNumberish;

  borrowingFactor?: BigNumberish;
  borrowingFactorForLongs?: BigNumberish;
  borrowingFactorForShorts?: BigNumberish;

  borrowingExponentFactor?: BigNumberish;
  borrowingExponentFactorForLongs?: BigNumberish;
  borrowingExponentFactorForShorts?: BigNumberish;

  fundingFactor: BigNumberish;
  fundingExponentFactor: BigNumberish;
  fundingIncreaseFactorPerSecond: BigNumberish;
  fundingDecreaseFactorPerSecond: BigNumberish;
  thresholdForStableFunding: BigNumberish;
  thresholdForDecreaseFunding: BigNumberish;
  minFundingFactorPerSecond: BigNumberish;
  maxFundingFactorPerSecond: BigNumberish;

  positionImpactPoolDistributionRate: BigNumberish;
  minPositionImpactPoolAmount: BigNumberish;

  virtualMarketId?: string;
  virtualTokenIdForIndexToken?: string;

  isDisabled?: boolean;
};

export type SpotMarketConfig = Partial<BaseMarketConfig> & {
  tokens: {
    longToken: string;
    shortToken: string;
    indexToken?: never;
  };
  swapOnly: true;
};

export type PerpMarketConfig = Partial<BaseMarketConfig> & {
  tokens: {
    indexToken: string;
    longToken: string;
    shortToken: string;
  };
  swapOnly?: never;
  reversed: boolean;
};

export type MarketConfig = SpotMarketConfig | PerpMarketConfig;

type FundingRateConfig = Partial<{
  fundingFactor: BigNumberish;
  fundingExponentFactor: BigNumberish;

  fundingIncreaseFactorPerSecond: BigNumberish;
  fundingDecreaseFactorPerSecond: BigNumberish;
  thresholdForStableFunding: BigNumberish;
  thresholdForDecreaseFunding: BigNumberish;
  minFundingFactorPerSecond: BigNumberish;
  maxFundingFactorPerSecond: BigNumberish;
}>;

const fundingRateConfig_Low: FundingRateConfig = {
  // increase to 75% at 100% imbalance (100%/0%) in 3 hours
  // increase to 75% at 20% imbalance (60.%/40%) in 15 hours
  fundingIncreaseFactorPerSecond: percentageToFloat("75%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 3),

  // reduce from max 75% to 0% in 48 hours
  fundingDecreaseFactorPerSecond: percentageToFloat("75%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 48),

  maxFundingFactorPerSecond: percentageToFloat("75%").div(SECONDS_PER_YEAR),

  thresholdForStableFunding: percentageToFloat("4%"),
  thresholdForDecreaseFunding: 0,
};

const fundingRateConfig_Default: FundingRateConfig = {
  // increase to 90% at 100% imbalance (100%/0%) in 3 hours
  // increase to 90% at 20% imbalance (60.%/40%) in 15 hours
  fundingIncreaseFactorPerSecond: percentageToFloat("90%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 3),

  // reduce from max 90% to 0% in 48 hours
  fundingDecreaseFactorPerSecond: percentageToFloat("90%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 48),

  maxFundingFactorPerSecond: percentageToFloat("90%").div(SECONDS_PER_YEAR),

  thresholdForStableFunding: percentageToFloat("4%"),
  thresholdForDecreaseFunding: 0,
};

const fundingRateConfig_High: FundingRateConfig = {
  // increase to 100% at 100% imbalance (100%/0%) in 3 hours
  // increase to 100% at 20% imbalance (60.%/40%) in 15 hours
  fundingIncreaseFactorPerSecond: percentageToFloat("100%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 3),

  // reduce from max 100% to 0% in 48 hours
  fundingDecreaseFactorPerSecond: percentageToFloat("100%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 48),

  maxFundingFactorPerSecond: percentageToFloat("100%").div(SECONDS_PER_YEAR),

  thresholdForStableFunding: percentageToFloat("4%"),
  thresholdForDecreaseFunding: 0,
};

const fundingRateConfig_SingleToken: FundingRateConfig = {
  // increase to 90% at 100% imbalance (100%/0%) in 3 hours
  // increase to 90% at 20% imbalance (60%/40%) in 15 hours
  fundingIncreaseFactorPerSecond: percentageToFloat("90%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 3),

  // reduce from max 90% to 0% in 48 hours
  fundingDecreaseFactorPerSecond: percentageToFloat("90%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 48),

  maxFundingFactorPerSecond: percentageToFloat("90%").div(SECONDS_PER_YEAR),

  thresholdForStableFunding: percentageToFloat("4%"),
  thresholdForDecreaseFunding: 0,
};

type BorrowingRateConfig = Partial<{
  optimalUsageFactor: BigNumberish;
  baseBorrowingFactor: BigNumberish;
  aboveOptimalUsageBorrowingFactor: BigNumberish;
}>;

const borrowingRateConfig_LowMax_WithLowerBase: BorrowingRateConfig = {
  optimalUsageFactor: percentageToFloat("75%"),
  baseBorrowingFactor: percentageToFloat("45%").div(SECONDS_PER_YEAR),
  aboveOptimalUsageBorrowingFactor: percentageToFloat("100%").div(SECONDS_PER_YEAR),
};
const borrowingRateConfig_LowMax_WithHigherBase: BorrowingRateConfig = {
  optimalUsageFactor: percentageToFloat("75%"),
  baseBorrowingFactor: percentageToFloat("50%").div(SECONDS_PER_YEAR),
  aboveOptimalUsageBorrowingFactor: percentageToFloat("100%").div(SECONDS_PER_YEAR),
};

const borrowingRateConfig_HighMax_WithLowerBase: BorrowingRateConfig = {
  optimalUsageFactor: percentageToFloat("75%"),
  baseBorrowingFactor: percentageToFloat("50%").div(SECONDS_PER_YEAR),
  aboveOptimalUsageBorrowingFactor: percentageToFloat("130%").div(SECONDS_PER_YEAR),
};
const borrowingRateConfig_HighMax_WithHigherBase: BorrowingRateConfig = {
  optimalUsageFactor: percentageToFloat("75%"),
  baseBorrowingFactor: percentageToFloat("55%").div(SECONDS_PER_YEAR),
  aboveOptimalUsageBorrowingFactor: percentageToFloat("130%").div(SECONDS_PER_YEAR),
};

const baseMarketConfig: Partial<BaseMarketConfig> = {
  // Dynamic MMR defaults. Sized so that at currLeverage == maxLeverage,
  // the trader can absorb ~50% of collateral loss before liquidation:
  //   mmr_tuning = 0.5 / maxLeverage
  // At low leverage, min_mmr floors the required buffer.
  // min_leverage is opt-in (0 = no lower bound). Set it per-market to enforce.
  maxLeverage: decimalToFloat(50), // conservative default for markets without an asset-class override
  minLeverage: 0,
  minMmr: percentageToFloat("0.3%"),
  maxMmr: percentageToFloat("10%"),
  mmrTuning: percentageToFloat("1%"), // 0.5 / 50x

  minCollateralFactorForOpenInterestMultiplier: 0,

  reserveFactor: percentageToFloat("95%"),
  openInterestReserveFactor: percentageToFloat("90%"),

  maxPnlFactorForTraders: percentageToFloat("90%"),
  maxPnlFactorForAdl: percentageToFloat("85%"),
  minPnlFactorAfterAdl: percentageToFloat("77%"),

  maxPnlFactorForDeposits: percentageToFloat("90%"),
  maxPnlFactorForWithdrawals: percentageToFloat("70%"),

  positionFeeFactorForPositiveImpact: percentageToFloat("0.04%"),
  positionFeeFactorForNegativeImpact: percentageToFloat("0.06%"),

  negativePositionImpactFactor: exponentToFloat("1e-7"),
  positivePositionImpactFactor: exponentToFloat("8e-8"),
  positionImpactExponentFactor: exponentToFloat("1.45e0"),

  negativeMaxPositionImpactFactor: percentageToFloat("0.5%"),
  positiveMaxPositionImpactFactor: percentageToFloat("0.5%"),
  maxPositionImpactFactorForLiquidations: bigNumberify(0), // 0%

  swapFeeFactorForPositiveImpact: percentageToFloat("0.05%"),
  swapFeeFactorForNegativeImpact: percentageToFloat("0.07%"),
  atomicSwapFeeFactor: percentageToFloat("0.5%"),
  atomicWithdrawalFeeFactor: percentageToFloat("0.5%"),

  negativeSwapImpactFactor: bigNumberify(0),
  positiveSwapImpactFactor: bigNumberify(0),
  swapImpactExponentFactor: exponentToFloat("2e0"), // 2

  minCollateralUsd: decimalToFloat(1, 0), // 1 USD

  borrowingFactor: exponentToFloat("3.6e-8").div(SECONDS_PER_DAY), // 0.000000036 / 86400 per second

  optimalUsageFactor: 0,
  baseBorrowingFactor: 0,
  aboveOptimalUsageBorrowingFactor: 0, // kink disabled (optimalUsageFactor=0); validator caps the raw value at 1e23, so any larger sentinel reverts

  borrowingExponentFactor: exponentToFloat("1.52e0"),

  fundingFactor: exponentToFloat("4.32e-7").div(SECONDS_PER_DAY), // 0.000000432 / 86400 per second
  fundingExponentFactor: exponentToFloat("1.48e0"),

  minFundingFactorPerSecond: percentageToFloat("1%").div(SECONDS_PER_YEAR),
  maxFundingFactorPerSecond: percentageToFloat("90%").div(SECONDS_PER_YEAR), // ~0.246% per day
  fundingIncreaseFactorPerSecond: percentageToFloat("90%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 3),
  fundingDecreaseFactorPerSecond: decimalToFloat(0), // not applicable if thresholdForDecreaseFunding = 0
  thresholdForDecreaseFunding: decimalToFloat(0),

  positionImpactPoolDistributionRate: bigNumberify(0),
  minPositionImpactPoolAmount: 0,

  liquidationFeeFactor: percentageToFloat("0.50%"),
};

const singleTokenMarketConfig: Partial<BaseMarketConfig> = {
  reserveFactor: percentageToFloat("40%"),
  openInterestReserveFactor: percentageToFloat("35%"),

  maxPnlFactorForTraders: percentageToFloat("90%"),
  maxPnlFactorForAdl: percentageToFloat("85%"),
  minPnlFactorAfterAdl: percentageToFloat("77%"),

  maxPnlFactorForDeposits: percentageToFloat("90%"),
  maxPnlFactorForWithdrawals: percentageToFloat("70%"),

  swapFeeFactorForPositiveImpact: bigNumberify(0),
  swapFeeFactorForNegativeImpact: bigNumberify(0),
  atomicSwapFeeFactor: percentageToFloat("0.5%"),

  negativeSwapImpactFactor: bigNumberify(0),
  positiveSwapImpactFactor: bigNumberify(0),
  swapImpactExponentFactor: decimalToFloat(1),

  liquidationFeeFactor: percentageToFloat("0.30%"),
};

const syntheticMarketConfig: Partial<BaseMarketConfig> = {
  ...baseMarketConfig,

  reserveFactor: percentageToFloat("95%"),
  openInterestReserveFactor: percentageToFloat("90%"),

  maxPnlFactorForTraders: percentageToFloat("60%"),
  maxPnlFactorForAdl: percentageToFloat("55%"),
  minPnlFactorAfterAdl: percentageToFloat("50%"),

  maxPnlFactorForDeposits: percentageToFloat("60%"),
  maxPnlFactorForWithdrawals: percentageToFloat("45%"),
};

const synthethicMarketConfig_IncreasedCapacity: Partial<BaseMarketConfig> = {
  ...syntheticMarketConfig,

  reserveFactor: percentageToFloat("125%"),
  openInterestReserveFactor: percentageToFloat("120%"),

  maxPnlFactorForTraders: percentageToFloat("70%"),
  maxPnlFactorForAdl: percentageToFloat("65%"),
  minPnlFactorAfterAdl: percentageToFloat("60%"),

  maxPnlFactorForDeposits: percentageToFloat("70%"),
  maxPnlFactorForWithdrawals: percentageToFloat("55%"),
};

const fxMarketOverrides: Partial<BaseMarketConfig> = {
  positionFeeFactorForPositiveImpact: percentageToFloat("0.01%"),
  positionFeeFactorForNegativeImpact: percentageToFloat("0.015%"),

  maxLeverage: decimalToFloat(500),
  minLeverage: 0,
  minMmr: percentageToFloat("0.1%"),
  maxMmr: percentageToFloat("10%"),
  mmrTuning: percentageToFloat("0.1%"), // 0.5 / 500x

  leverageLadder: fxLeverageLadder,
};

const commodityMarketOverrides: Partial<BaseMarketConfig> = {
  positionFeeFactorForPositiveImpact: percentageToFloat("0.005%"),
  positionFeeFactorForNegativeImpact: percentageToFloat("0.01%"),

  maxLeverage: decimalToFloat(200),
  minLeverage: 0,
  minMmr: percentageToFloat("0.2%"),
  maxMmr: percentageToFloat("10%"),
  mmrTuning: percentageToFloat("0.25%"), // 0.5 / 200x

  leverageLadder: goldLeverageLadder,
};

const cryptoMarketOverrides: Partial<BaseMarketConfig> = {
  positionFeeFactorForPositiveImpact: percentageToFloat("0.02%"),
  positionFeeFactorForNegativeImpact: percentageToFloat("0.025%"),

  maxLeverage: decimalToFloat(100),
  minLeverage: 0,
  minMmr: percentageToFloat("0.3%"),
  maxMmr: percentageToFloat("10%"),
  mmrTuning: percentageToFloat("0.5%"), // 0.5 / 100x

  leverageLadder: cryptoLeverageLadder,
};

const stablecoinSwapMarketConfig: Partial<SpotMarketConfig> = {
  swapOnly: true,

  swapFeeFactorForPositiveImpact: decimalToFloat(1, 4), // 0.01%,
  swapFeeFactorForNegativeImpact: decimalToFloat(1, 4), // 0.01%,

  negativeSwapImpactFactor: exponentToFloat("5e-10"), // 0.01% for 200,000 USD of imbalance
  positiveSwapImpactFactor: exponentToFloat("5e-10"), // 0.01% for 200,000 USD of imbalance
};

const hardhatBaseMarketConfig: Partial<BaseMarketConfig> = {
  reserveFactor: decimalToFloat(5, 1), // 50%,
  openInterestReserveFactor: decimalToFloat(5, 1), // 50%,

  // Dynamic MMR defaults for hardhat — 100x cap + 1% min_mmr give tests a flat 1%
  // effective MMR across all leverages (tuning 0.5% at max is below the floor).
  // Prod markets (fx/commodity/crypto) use sub-floor tuning to expose the dynamic curve.
  // min_leverage stays 0 (opt-in); tests that want the lower-bound gate set it per-market.
  maxLeverage: decimalToFloat(100),
  minLeverage: 0,
  minMmr: percentageToFloat("1%"),
  maxMmr: percentageToFloat("10%"),
  mmrTuning: percentageToFloat("0.5%"), // 0.5 / 100x

  minCollateralFactorForOpenInterestMultiplier: 0,

  maxLongTokenPoolAmount: expandDecimals(1_000_000_000, 18),
  maxShortTokenPoolAmount: expandDecimals(1_000_000_000, 18),

  maxPoolUsdForDeposit: decimalToFloat(1_000_000_000_000_000),
  maxOpenInterest: decimalToFloat(1_000_000_000),

  maxPnlFactorForTraders: decimalToFloat(5, 1), // 50%
  maxPnlFactorForAdl: decimalToFloat(45, 2), // 45%
  minPnlFactorAfterAdl: decimalToFloat(4, 1), // 40%

  maxPnlFactorForDeposits: decimalToFloat(6, 1), // 60%
  maxPnlFactorForWithdrawals: decimalToFloat(3, 1), // 30%

  positiveMaxPositionImpactFactor: decimalToFloat(2, 2), // 2%
  negativeMaxPositionImpactFactor: decimalToFloat(2, 2), // 2%
  maxPositionImpactFactorForLiquidations: percentageToFloat("1%"), // 1%

  maxFundingFactorPerSecond: "100000000000000000000000",
};

const config: {
  [network: string]: MarketConfig[];
} = {
  base: [
    // TODO: add more parameters for each mainnet market
    {
      tokens: { indexToken: "EUR", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "GBP", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "GOLD", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "XAG", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "JPY", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "WTI", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "WBTC", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "TAO", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
  ],
  baseSepolia: [
    // Forex markets — syntheticMarketConfig + FX fees + 100M USD0 pool, 50M OI
    {
      tokens: { indexToken: "EUR", longToken: "USD0", shortToken: "USD0" },
      reversed: false,
      ...syntheticMarketConfig,
      ...fxMarketOverrides,
      maxLongTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxShortTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxPoolUsdForDeposit: decimalToFloat(1_000_000_000), // 1B USD
      maxOpenInterestForLongs: decimalToFloat(50_000_000),
      maxOpenInterestForShorts: decimalToFloat(50_000_000),
    },
    {
      tokens: { indexToken: "GBP", longToken: "USD0", shortToken: "USD0" },
      reversed: false,
      ...syntheticMarketConfig,
      ...fxMarketOverrides,
      maxLongTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxShortTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxPoolUsdForDeposit: decimalToFloat(1_000_000_000), // 1B USD
      maxOpenInterestForLongs: decimalToFloat(50_000_000),
      maxOpenInterestForShorts: decimalToFloat(50_000_000),
    },
    // Commodity markets — syntheticMarketConfig + commodity fees + 100M USD0 pool, 50M OI
    {
      tokens: { indexToken: "GOLD", longToken: "USD0", shortToken: "USD0" },
      reversed: false,
      ...syntheticMarketConfig,
      ...commodityMarketOverrides,
      maxLongTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxShortTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxPoolUsdForDeposit: decimalToFloat(1_000_000_000), // 1B USD
      maxOpenInterestForLongs: decimalToFloat(50_000_000),
      maxOpenInterestForShorts: decimalToFloat(50_000_000),
    },
    // XAG/USD [USD0-USD0] — commodity market
    {
      tokens: { indexToken: "XAG", longToken: "USD0", shortToken: "USD0" },
      reversed: false,
      ...syntheticMarketConfig,
      ...commodityMarketOverrides,
      maxLongTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxShortTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxPoolUsdForDeposit: decimalToFloat(1_000_000_000), // 1B USD
      maxOpenInterestForLongs: decimalToFloat(50_000_000),
      maxOpenInterestForShorts: decimalToFloat(50_000_000),
    },
    // USD/JPY — forex (Pyth feed natively provides USD/JPY)
    {
      tokens: { indexToken: "JPY", longToken: "USD0", shortToken: "USD0" },
      reversed: false,
      ...syntheticMarketConfig,
      ...fxMarketOverrides,
      maxLongTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxShortTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxPoolUsdForDeposit: decimalToFloat(1_000_000_000), // 1B USD
      maxOpenInterestForLongs: decimalToFloat(50_000_000),
      maxOpenInterestForShorts: decimalToFloat(50_000_000),
    },
    // WTI/USD [USD0-USD0] — commodity market
    {
      tokens: { indexToken: "WTI", longToken: "USD0", shortToken: "USD0" },
      reversed: false,
      ...syntheticMarketConfig,
      ...commodityMarketOverrides,
      maxLongTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxShortTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxPoolUsdForDeposit: decimalToFloat(1_000_000_000), // 1B USD
      maxOpenInterestForLongs: decimalToFloat(50_000_000),
      maxOpenInterestForShorts: decimalToFloat(50_000_000),
    },
    // Crypto markets — syntheticMarketConfig + crypto fees + 100M USD0 pool, 50M OI
    {
      tokens: { indexToken: "WBTC", longToken: "USD0", shortToken: "USD0" },
      reversed: false,
      ...syntheticMarketConfig,
      ...cryptoMarketOverrides,
      maxLongTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxShortTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxPoolUsdForDeposit: decimalToFloat(1_000_000_000), // 1B USD
      maxOpenInterestForLongs: decimalToFloat(50_000_000),
      maxOpenInterestForShorts: decimalToFloat(50_000_000),
    },
    {
      tokens: { indexToken: "WETH", longToken: "USD0", shortToken: "USD0" },
      reversed: false,
      ...syntheticMarketConfig,
      ...cryptoMarketOverrides,
      maxLongTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxShortTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxPoolUsdForDeposit: decimalToFloat(1_000_000_000), // 1B USD
      maxOpenInterestForLongs: decimalToFloat(50_000_000),
      maxOpenInterestForShorts: decimalToFloat(50_000_000),
    },
    // TAO/USD [USD0-USD0] — crypto market
    {
      tokens: { indexToken: "TAO", longToken: "USD0", shortToken: "USD0" },
      reversed: false,
      ...syntheticMarketConfig,
      ...cryptoMarketOverrides,
      maxLongTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxShortTokenPoolAmount: expandDecimals(1_000_000_000, 6), // 1B USD0
      maxPoolUsdForDeposit: decimalToFloat(1_000_000_000), // 1B USD
      maxOpenInterestForLongs: decimalToFloat(50_000_000),
      maxOpenInterestForShorts: decimalToFloat(50_000_000),
    },
  ],
  hardhat: [
    {
      tokens: { indexToken: "EUR", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "GBP", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "GOLD", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "XAG", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "JPY", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "WTI", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "WBTC", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "TAO", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },

    // For testing only
    {
      tokens: { indexToken: "SOL", longToken: "WETH", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { longToken: "WETH", shortToken: "USDC" },
      swapOnly: true,
    },
    {
      tokens: { indexToken: "WBTC", longToken: "WBTC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "WETH" },
      reversed: false,
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "WETH", longToken: "WETH", shortToken: "USDT" },
      reversed: false,
    },
  ],
  localhost: [
    {
      tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
      maxLongTokenPoolAmount: expandDecimals(1_000_000_000, 6),
      maxShortTokenPoolAmount: expandDecimals(1_000_000_000, 6),
      maxLongTokenPoolUsdForDeposit: decimalToFloat(1_000_000_000),
      maxShortTokenPoolUsdForDeposit: decimalToFloat(1_000_000_000),
      maxOpenInterest: decimalToFloat(1_000_000_000),
      maxPnlFactorForTraders: decimalToFloat(5, 1),
      maxPnlFactorForAdl: decimalToFloat(45, 2),
      minPnlFactorAfterAdl: decimalToFloat(4, 1),
      maxPnlFactorForDeposits: decimalToFloat(6, 1),
      maxPnlFactorForWithdrawals: decimalToFloat(3, 1),
    },
    {
      tokens: { indexToken: "TAO", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
  ],
};

function fillLongShortValues(market, key, longKey, shortKey) {
  if (market[longKey] === undefined) {
    market[longKey] = market[key];
  }

  if (market[shortKey] === undefined) {
    market[shortKey] = market[key];
  }
}

export default async function (hre: HardhatRuntimeEnvironment) {
  const markets = config[hre.network.name === "baseSepoliaFork" ? "baseSepolia" : hre.network.name];
  const tokens = await hre.gmx.getTokens();
  const defaultMarketConfig = hre.network.name === "hardhat" ? hardhatBaseMarketConfig : baseMarketConfig;
  if (markets) {
    const seen = new Set<string>();
    for (const market of markets) {
      const tokenSymbols = Object.values(market.tokens);
      const tokenSymbolsKey = tokenSymbols.join(":") + ("reversed" in market && market.reversed ? ":reversed" : "");
      if (seen.has(tokenSymbolsKey)) {
        throw new Error(`Duplicate market: ${tokenSymbolsKey}`);
      }
      seen.add(tokenSymbolsKey);
      for (const tokenSymbol of tokenSymbols) {
        if (!tokens[tokenSymbol]) {
          throw new Error(`Market ${tokenSymbols.join(":")} uses token that does not exist: ${tokenSymbol}`);
        }
      }

      for (const key of Object.keys(defaultMarketConfig)) {
        if (market[key] === undefined) {
          market[key] = defaultMarketConfig[key];
        }
      }

      fillLongShortValues(market, "reserveFactor", "reserveFactorLongs", "reserveFactorShorts");

      fillLongShortValues(
        market,
        "openInterestReserveFactor",
        "openInterestReserveFactorLongs",
        "openInterestReserveFactorShorts"
      );

      fillLongShortValues(
        market,
        "minCollateralFactorForOpenInterestMultiplier",
        "minCollateralFactorForOpenInterestMultiplierLong",
        "minCollateralFactorForOpenInterestMultiplierShort"
      );

      fillLongShortValues(
        market,
        "maxPoolUsdForDeposit",
        "maxLongTokenPoolUsdForDeposit",
        "maxShortTokenPoolUsdForDeposit"
      );

      fillLongShortValues(market, "maxOpenInterest", "maxOpenInterestForLongs", "maxOpenInterestForShorts");

      fillLongShortValues(
        market,
        "maxPnlFactorForTraders",
        "maxPnlFactorForTradersLongs",
        "maxPnlFactorForTradersShorts"
      );

      fillLongShortValues(market, "maxPnlFactorForAdl", "maxPnlFactorForAdlLongs", "maxPnlFactorForAdlShorts");

      fillLongShortValues(market, "minPnlFactorAfterAdl", "minPnlFactorAfterAdlLongs", "minPnlFactorAfterAdlShorts");

      fillLongShortValues(
        market,
        "maxPnlFactorForDeposits",
        "maxPnlFactorForDepositsLongs",
        "maxPnlFactorForDepositsShorts"
      );

      fillLongShortValues(
        market,
        "maxPnlFactorForWithdrawals",
        "maxPnlFactorForWithdrawalsLongs",
        "maxPnlFactorForWithdrawalsShorts"
      );

      fillLongShortValues(
        market,
        "aboveOptimalUsageBorrowingFactor",
        "aboveOptimalUsageBorrowingFactorForLongs",
        "aboveOptimalUsageBorrowingFactorForShorts"
      );

      fillLongShortValues(market, "baseBorrowingFactor", "baseBorrowingFactorForLongs", "baseBorrowingFactorForShorts");

      fillLongShortValues(market, "optimalUsageFactor", "optimalUsageFactorForLongs", "optimalUsageFactorForShorts");

      fillLongShortValues(market, "borrowingFactor", "borrowingFactorForLongs", "borrowingFactorForShorts");

      fillLongShortValues(
        market,
        "borrowingExponentFactor",
        "borrowingExponentFactorForLongs",
        "borrowingExponentFactorForShorts"
      );
    }
  }
  return markets;
}
