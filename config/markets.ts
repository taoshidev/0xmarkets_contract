import { BigNumberish } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_YEAR } from "../utils/constants";
import { bigNumberify, decimalToFloat, expandDecimals, exponentToFloat, percentageToFloat } from "../utils/math";

export type BaseMarketConfig = {
  reserveFactor: BigNumberish;
  reserveFactorLongs?: BigNumberish;
  reserveFactorShorts?: BigNumberish;

  openInterestReserveFactor?: BigNumberish;
  openInterestReserveFactorLongs?: BigNumberish;
  openInterestReserveFactorShorts?: BigNumberish;

  minCollateralFactor: BigNumberish;
  minMaintainCollateralFactor: BigNumberish;
  minCollateralFactorForOpenInterestMultiplier?: BigNumberish;
  minCollateralFactorForOpenInterestMultiplierLong?: BigNumberish;
  minCollateralFactorForOpenInterestMultiplierShort?: BigNumberish;

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

  liquidationFeeInsuranceFactor: BigNumberish;
  insuranceTargetRatio: BigNumberish;

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
  reserveFactor: percentageToFloat("95%"),

  openInterestReserveFactor: percentageToFloat("90%"),

  minCollateralFactor: percentageToFloat("1%"),
  minMaintainCollateralFactor: percentageToFloat("0.2%"),
  minCollateralFactorForOpenInterestMultiplier: 0,

  maxPnlFactorForTraders: percentageToFloat("90%"),

  maxPnlFactorForAdl: percentageToFloat("85%"),

  minPnlFactorAfterAdl: percentageToFloat("77%"),

  maxPnlFactorForDeposits: percentageToFloat("90%"),

  maxPnlFactorForWithdrawals: percentageToFloat("70%"),

  positionFeeFactorForPositiveImpact: decimalToFloat(1, 4), // 0.0001
  positionFeeFactorForNegativeImpact: decimalToFloat(15, 5), // 0.00015

  negativePositionImpactFactor: decimalToFloat(1, 7), // 0.0000001
  positivePositionImpactFactor: decimalToFloat(8, 8), // 0.00000008
  positionImpactExponentFactor: decimalToFloat(145, 2), // 1.45

  negativeMaxPositionImpactFactor: percentageToFloat("0.5%"),
  positiveMaxPositionImpactFactor: percentageToFloat("0.5%"),
  maxPositionImpactFactorForLiquidations: bigNumberify(0), // 0%

  swapFeeFactorForPositiveImpact: percentageToFloat("0.05%"),
  swapFeeFactorForNegativeImpact: percentageToFloat("0.07%"),
  atomicSwapFeeFactor: percentageToFloat("0.5%"),
  atomicWithdrawalFeeFactor: percentageToFloat("0.5%"),

  negativeSwapImpactFactor: percentageToFloat("0.001%"),
  positiveSwapImpactFactor: percentageToFloat("0.0005%"),
  swapImpactExponentFactor: exponentToFloat("2e0"), // 2

  minCollateralUsd: decimalToFloat(1, 0), // 1 USD

  aboveOptimalUsageBorrowingFactor: percentageToFloat("100%").div(SECONDS_PER_YEAR),

  baseBorrowingFactor: 0,

  optimalUsageFactor: 0,

  borrowingFactor: decimalToFloat(36, 9).div(SECONDS_PER_DAY), // 0.000000036 per second

  borrowingExponentFactor: decimalToFloat(152, 2), // 1.52

  fundingFactor: decimalToFloat(432, 9).div(SECONDS_PER_DAY), // 0.000000432 per second
  fundingExponentFactor: decimalToFloat(148, 2), // 1.48
  fundingIncreaseFactorPerSecond: percentageToFloat("90%")
    .div(SECONDS_PER_YEAR)
    .div(SECONDS_PER_HOUR * 3),
  fundingDecreaseFactorPerSecond: 0,
  thresholdForDecreaseFunding: 0,
  minFundingFactorPerSecond: percentageToFloat("1%").div(SECONDS_PER_YEAR),
  maxFundingFactorPerSecond: percentageToFloat("90%").div(SECONDS_PER_YEAR), // ~0.246% per day

  positionImpactPoolDistributionRate: bigNumberify(0),
  minPositionImpactPoolAmount: 0,

  liquidationFeeFactor: percentageToFloat("50%"),

  liquidationFeeInsuranceFactor: bigNumberify(0),
  insuranceTargetRatio: bigNumberify(0),
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

  liquidationFeeFactor: percentageToFloat("0.30%"),
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

  minCollateralFactor: percentageToFloat("1%"),
  minMaintainCollateralFactor: percentageToFloat("1%"),
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

  liquidationFeeInsuranceFactor: bigNumberify(0),
  insuranceTargetRatio: bigNumberify(0),
};

const config: {
  [network: string]: MarketConfig[];
} = {
  base: [
    // TODO: add more parameters for each mainnet market
    {
      tokens: { indexToken: "EUR", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
      ...baseMarketConfig,
    },
    {
      tokens: { indexToken: "GBP", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
      ...baseMarketConfig,
    },
    {
      tokens: { indexToken: "GOLD", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
      ...baseMarketConfig,
    },
    {
      tokens: { indexToken: "JPY", longToken: "USDC", shortToken: "USDC" },
      reversed: true,
      ...baseMarketConfig,
    },
    {
      tokens: { indexToken: "WBTC", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
      ...baseMarketConfig,
    },
    {
      tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
      ...baseMarketConfig,
    },
  ],
  baseSepolia: [
    {
      tokens: { indexToken: "EUR", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
      ...baseMarketConfig,
    },
    {
      tokens: { indexToken: "GBP", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
      ...baseMarketConfig,
    },
    {
      tokens: { indexToken: "GOLD", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
      ...baseMarketConfig,
    },
    {
      tokens: { indexToken: "JPY", longToken: "USDC", shortToken: "USDC" },
      reversed: true,
      ...baseMarketConfig,
    },
    {
      tokens: { indexToken: "WBTC", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
      ...baseMarketConfig,
    },
    {
      tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
      ...baseMarketConfig,
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
      tokens: { indexToken: "JPY", longToken: "USDC", shortToken: "USDC" },
      reversed: true,
    },
    {
      tokens: { indexToken: "WBTC", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "USDC" },
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
      tokens: { indexToken: "JPY", longToken: "USDC", shortToken: "USDC" },
      reversed: true,
    },
    {
      tokens: { indexToken: "WBTC", longToken: "USDC", shortToken: "USDC" },
      reversed: false,
    },
    {
      tokens: { indexToken: "WETH", longToken: "USDC", shortToken: "USDC" },
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
  const markets = config[hre.network.name];
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
