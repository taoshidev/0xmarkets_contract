import { ethers } from "hardhat";
import { keccak256 } from "ethers/lib/utils";
import * as fs from "fs";
import * as path from "path";

function encodeKey(name: string): string {
  return keccak256(ethers.utils.defaultAbiCoder.encode(["string"], [name]));
}

function encodeMarketKey(baseKey: string, market: string, flag: boolean): string {
  return keccak256(
    ethers.utils.defaultAbiCoder.encode(["bytes32", "address", "bool"], [encodeKey(baseKey), market, flag])
  );
}

function encodeMarketKeyNoFlag(baseKey: string, market: string): string {
  return keccak256(ethers.utils.defaultAbiCoder.encode(["bytes32", "address"], [encodeKey(baseKey), market]));
}

function encodeGlobalKey(baseKey: string): string {
  return encodeKey(baseKey);
}

const MARKETS: Record<string, string> = {
  "EUR/USD": "0x7054eb596aCF4fC1C0686C9B2cdAC4aE6c6D0F33",
  "GBP/USD": "0xa09b59adf15B4ED98a099441b84Ff1eABf71B548",
  "GOLD/USD": "0x89c3B33bEE4b9cD1B246BE44aDcEd870F74637a3",
  "XAG/USD": "0x6D260c4229dBb55a0a91041b5c07b320fdD6303B",
  "USD/JPY": "0xD847a999faCe1f862120117C33ae8faBA768fD4b",
  "WTI/USD": "0x80d260188c592F7F175F843EDc257b6A6Af6e5eF",
  "WBTC/USD": "0x63D05Da932541380df8d9eE20D8FdB4B02849398",
  "WETH/USD": "0x23F40e3279685413b252A6944AF9a0641D3aa6ce",
  "TAO/USD": "0x24061f45f954D880dCa0Ce122FFA60Cfd5447B5A",
};

const DATASTORE_ADDRESS = "0x0cA7D71845cb485B7593bBdCbcac93d82d52d053";

const SECONDS_PER_YEAR = 31536000;

async function main() {
  const dataStore = await ethers.getContractAt("DataStore", DATASTORE_ADDRESS);

  // ── Formatting helpers ──

  const toPercent = (v: any) => {
    const num = Number(v.toString()) / 1e28;
    return `${num.toFixed(4)}%`;
  };

  const toRate = (v: any) => {
    const num = Number(v.toString()) / 1e30;
    return `${(num * 100).toFixed(6)}%`;
  };

  const toAnnualRate = (v: any) => {
    const num = Number(v.toString()) / 1e30;
    const annual = num * SECONDS_PER_YEAR * 100;
    return `${annual.toFixed(2)}%/yr`;
  };

  const toUsd = (v: any) => {
    const num = Number(v.toString()) / 1e30;
    return `$${num.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  };

  const toTokenAmount = (v: any) => {
    const num = Number(v.toString()) / 1e6; // USDC has 6 decimals
    return num.toLocaleString("en-US", { maximumFractionDigits: 4 });
  };

  const toExponential = (v: any) => {
    return Number(v.toString()).toExponential(4);
  };

  const toFactor = (v: any) => {
    const num = Number(v.toString()) / 1e30;
    return num.toExponential(4);
  };

  const toRaw = (v: any) => {
    return v.toString();
  };

  // Helper to read a uint with market key (flagged for long/short)
  const getMarketUint = (key: string, market: string, isLong: boolean) =>
    dataStore.getUint(encodeMarketKey(key, market, isLong));

  // Helper to read a uint with market key (no flag)
  const getMarketUintNoFlag = (key: string, market: string) => dataStore.getUint(encodeMarketKeyNoFlag(key, market));

  // Helper to read a bytes32 with market key (no flag)
  const getMarketBytes32NoFlag = (key: string, market: string) =>
    dataStore.getBytes32(encodeMarketKeyNoFlag(key, market));

  // Helper to read a bool with market key (no flag)
  const getMarketBoolNoFlag = (key: string, market: string) => dataStore.getBool(encodeMarketKeyNoFlag(key, market));

  // Helper to read an int with market key (no flag)
  const getMarketIntNoFlag = (key: string, market: string) => dataStore.getInt(encodeMarketKeyNoFlag(key, market));

  // Helpers to read global (non-market-scoped) values
  const getGlobalUint = (key: string) => dataStore.getUint(encodeGlobalKey(key));
  const getGlobalAddress = (key: string) => dataStore.getAddress(encodeGlobalKey(key));

  const lines: string[] = [];
  const w = (line = "") => lines.push(line);

  w("# 0xMarkets — On-Chain Market Parameters");
  w();
  w(`> Auto-generated on ${new Date().toISOString()}`);
  w();
  w("---");
  w();

  // ══════════════════════════════════════════════════════════
  //  Global Settings
  // ══════════════════════════════════════════════════════════
  console.log("Reading global settings ...");

  const veAlphaFeeReceiver = await getGlobalAddress("VEALPHA_FEE_RECEIVER");
  const treasuryFeeReceiver = await getGlobalAddress("TREASURY_FEE_RECEIVER");
  const buybackFeeReceiver = await getGlobalAddress("BUYBACK_FEE_RECEIVER");
  const validatorFeeReceiver = await getGlobalAddress("VALIDATOR_FEE_RECEIVER");
  const insuranceFundAddress = await getGlobalAddress("INSURANCE_FUND_ADDRESS");
  const liqFeeValidatorFactor = await getGlobalUint("LIQUIDATION_FEE_VALIDATOR_FACTOR");
  const liqFeeInsuranceFactor = await getGlobalUint("LIQUIDATION_FEE_INSURANCE_FACTOR");
  // Pool share = 100% minus validator + insurance.
  const liqFeePoolFactorRaw = ethers.BigNumber.from("1000000000000000000000000000000") // 1e30
    .sub(liqFeeValidatorFactor)
    .sub(liqFeeInsuranceFactor);

  w("## Global Settings");
  w();
  w("### Fee Receivers");
  w();
  w("| Parameter | Value |");
  w("|---|---|");
  w(`| veAlphaFeeReceiver | \`${veAlphaFeeReceiver}\` |`);
  w(`| treasuryFeeReceiver | \`${treasuryFeeReceiver}\` |`);
  w(`| buybackFeeReceiver | \`${buybackFeeReceiver}\` |`);
  w(`| validatorFeeReceiver | \`${validatorFeeReceiver}\` |`);
  w(`| insuranceFundAddress | \`${insuranceFundAddress}\` |`);
  w();
  w("### Liquidation Fee Split");
  w();
  w(
    "The per-market `liquidationFeeFactor` determines the total fee (as a share of `remainingCollateralUsd` at liquidation time). That fee is then split three ways by the global factors below:"
  );
  w();
  w("| Recipient | Share of liquidation fee |");
  w("|---|---|");
  w(`| Validator | ${toRate(liqFeeValidatorFactor)} |`);
  w(`| Insurance fund | ${toRate(liqFeeInsuranceFactor)} |`);
  w(`| Pool (remainder) | ${toRate(liqFeePoolFactorRaw)} |`);
  w();
  w("---");
  w();

  // ══════════════════════════════════════════════════════════
  //  Per-Market Config
  // ══════════════════════════════════════════════════════════

  for (const [name, address] of Object.entries(MARKETS)) {
    console.log(`Reading ${name} ...`);

    w(`## ${name}`);
    w();
    w(`**Market Token:** \`${address}\``);
    w();

    // ── Market Status ──
    const isDisabled = await getMarketBoolNoFlag("IS_DISABLED", address);
    w(`**Disabled:** ${isDisabled ? "Yes" : "No"}`);
    w();

    // ── Virtual IDs ──
    const virtualMarketId = await getMarketBytes32NoFlag("VIRTUAL_MARKET_ID", address);
    const virtualTokenIdForIndexToken = await getMarketBytes32NoFlag("VIRTUAL_TOKEN_ID", address);

    // ── Reserve Factors ──
    const reserveFactorLongs = await getMarketUint("RESERVE_FACTOR", address, true);
    const reserveFactorShorts = await getMarketUint("RESERVE_FACTOR", address, false);
    const oiReserveFactorLongs = await getMarketUint("OPEN_INTEREST_RESERVE_FACTOR", address, true);
    const oiReserveFactorShorts = await getMarketUint("OPEN_INTEREST_RESERVE_FACTOR", address, false);

    w("### Reserve Factors");
    w();
    w("| Parameter | Longs | Shorts |");
    w("|---|---|---|");
    w(`| reserveFactor | ${toRate(reserveFactorLongs)} | ${toRate(reserveFactorShorts)} |`);
    w(`| openInterestReserveFactor | ${toRate(oiReserveFactorLongs)} | ${toRate(oiReserveFactorShorts)} |`);
    w();

    // ── Collateral Factors ──
    const mcf = await getMarketUintNoFlag("MIN_COLLATERAL_FACTOR", address);
    const mmcf = await getMarketUintNoFlag("MIN_MAINTAIN_COLLATERAL_FACTOR", address);
    const mcfOiMulLong = await getMarketUint("MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER", address, true);
    const mcfOiMulShort = await getMarketUint("MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER", address, false);
    const minCollateralUsd = await getMarketUintNoFlag("MIN_COLLATERAL_USD", address);

    w("### Collateral Factors");
    w();
    w("| Parameter | Value |");
    w("|---|---|");
    w(`| minCollateralFactor | ${toRate(mcf)} _(unused in current liquidation logic)_ |`);
    w(`| minMaintainCollateralFactor | ${toRate(mmcf)} |`);
    w(`| minCollateralFactorForOpenInterestMultiplierLong | ${toExponential(mcfOiMulLong)} |`);
    w(`| minCollateralFactorForOpenInterestMultiplierShort | ${toExponential(mcfOiMulShort)} |`);
    w(`| minCollateralUsd | ${toUsd(minCollateralUsd)} |`);
    w();

    // ── Leverage & Dynamic MMR ──
    const maxLeverage = await getMarketUintNoFlag("MAX_LEVERAGE", address);
    const minLeverage = await getMarketUintNoFlag("MIN_LEVERAGE", address);
    const minMmr = await getMarketUintNoFlag("MIN_MMR", address);
    const maxMmr = await getMarketUintNoFlag("MAX_MMR", address);
    const mmrTuning = await getMarketUintNoFlag("MMR_TUNING", address);

    // MAX_LEVERAGE / MIN_LEVERAGE are stored as 1e30-scaled multipliers (e.g. 100x → 100e30).
    const toLeverage = (v: any) => {
      const num = Number(v.toString()) / 1e30;
      return `${num.toFixed(2)}x`;
    };

    w("### Leverage & Dynamic MMR");
    w();
    w("Dynamic MMR: `rawMmr = (currentLeverage / maxLeverage) * mmrTuning`, clamped to `[minMmr, maxMmr]`.");
    w();
    w("| Parameter | Value |");
    w("|---|---|");
    w(`| maxLeverage | ${toLeverage(maxLeverage)} |`);
    w(`| minLeverage | ${toLeverage(minLeverage)} |`);
    w(`| minMmr | ${toRate(minMmr)} |`);
    w(`| maxMmr | ${toRate(maxMmr)} |`);
    w(`| mmrTuning | ${toRate(mmrTuning)} |`);
    w();

    // ── Pool Caps ──
    const maxLongTokenPoolAmount = await getMarketUint("MAX_POOL_AMOUNT", address, true);
    const maxShortTokenPoolAmount = await getMarketUint("MAX_POOL_AMOUNT", address, false);
    const maxLongTokenPoolUsdForDeposit = await getMarketUint("MAX_POOL_USD_FOR_DEPOSIT", address, true);
    const maxShortTokenPoolUsdForDeposit = await getMarketUint("MAX_POOL_USD_FOR_DEPOSIT", address, false);

    w("### Pool & Deposit Caps");
    w();
    w("| Parameter | Long | Short |");
    w("|---|---|---|");
    w(
      `| maxTokenPoolAmount | ${toTokenAmount(maxLongTokenPoolAmount)} USDC | ${toTokenAmount(
        maxShortTokenPoolAmount
      )} USDC |`
    );
    w(`| maxPoolUsdForDeposit | ${toUsd(maxLongTokenPoolUsdForDeposit)} | ${toUsd(maxShortTokenPoolUsdForDeposit)} |`);
    w();

    // ── Open Interest Caps ──
    const maxOILongs = await getMarketUint("MAX_OPEN_INTEREST", address, true);
    const maxOIShorts = await getMarketUint("MAX_OPEN_INTEREST", address, false);

    w("### Open Interest Caps");
    w();
    w("| Parameter | Longs | Shorts |");
    w("|---|---|---|");
    w(`| maxOpenInterest | ${toUsd(maxOILongs)} | ${toUsd(maxOIShorts)} |`);
    w();

    // ── PnL Factors ──
    const maxPnlTradersLongs = await getMarketUint("MAX_PNL_FACTOR_FOR_TRADERS", address, true);
    const maxPnlTradersShorts = await getMarketUint("MAX_PNL_FACTOR_FOR_TRADERS", address, false);
    const maxPnlAdlLongs = await getMarketUint("MAX_PNL_FACTOR_FOR_ADL", address, true);
    const maxPnlAdlShorts = await getMarketUint("MAX_PNL_FACTOR_FOR_ADL", address, false);
    const minPnlAfterAdlLongs = await getMarketUint("MIN_PNL_FACTOR_AFTER_ADL", address, true);
    const minPnlAfterAdlShorts = await getMarketUint("MIN_PNL_FACTOR_AFTER_ADL", address, false);
    const maxPnlDepositsLongs = await getMarketUint("MAX_PNL_FACTOR_FOR_DEPOSITS", address, true);
    const maxPnlDepositsShorts = await getMarketUint("MAX_PNL_FACTOR_FOR_DEPOSITS", address, false);
    const maxPnlWithdrawalsLongs = await getMarketUint("MAX_PNL_FACTOR_FOR_WITHDRAWALS", address, true);
    const maxPnlWithdrawalsShorts = await getMarketUint("MAX_PNL_FACTOR_FOR_WITHDRAWALS", address, false);

    w("### PnL Factors");
    w();
    w("| Parameter | Longs | Shorts |");
    w("|---|---|---|");
    w(`| maxPnlFactorForTraders | ${toRate(maxPnlTradersLongs)} | ${toRate(maxPnlTradersShorts)} |`);
    w(`| maxPnlFactorForAdl | ${toRate(maxPnlAdlLongs)} | ${toRate(maxPnlAdlShorts)} |`);
    w(`| minPnlFactorAfterAdl | ${toRate(minPnlAfterAdlLongs)} | ${toRate(minPnlAfterAdlShorts)} |`);
    w(`| maxPnlFactorForDeposits | ${toRate(maxPnlDepositsLongs)} | ${toRate(maxPnlDepositsShorts)} |`);
    w(`| maxPnlFactorForWithdrawals | ${toRate(maxPnlWithdrawalsLongs)} | ${toRate(maxPnlWithdrawalsShorts)} |`);
    w();

    // ── Position Fees ──
    const posFeePos = await getMarketUint("POSITION_FEE_FACTOR", address, true);
    const posFeeNeg = await getMarketUint("POSITION_FEE_FACTOR", address, false);
    const liqFee = await getMarketUintNoFlag("LIQUIDATION_FEE_FACTOR", address);

    w("### Position Fees");
    w();
    w("| Parameter | Value |");
    w("|---|---|");
    w(`| positionFeeFactorForPositiveImpact | ${toRate(posFeePos)} |`);
    w(`| positionFeeFactorForNegativeImpact | ${toRate(posFeeNeg)} |`);
    w(`| liquidationFeeFactor | ${toRate(liqFee)} _(split: see Global Settings)_ |`);
    w();

    // ── Position Impact ──
    const negPosImpactFactor = await getMarketUint("POSITION_IMPACT_FACTOR", address, false);
    const posPosImpactFactor = await getMarketUint("POSITION_IMPACT_FACTOR", address, true);
    const posImpactExponent = await getMarketUintNoFlag("POSITION_IMPACT_EXPONENT_FACTOR", address);
    const negMaxPosImpact = await getMarketUint("MAX_POSITION_IMPACT_FACTOR", address, false);
    const posMaxPosImpact = await getMarketUint("MAX_POSITION_IMPACT_FACTOR", address, true);
    const maxPosImpactForLiq = await getMarketUintNoFlag("MAX_POSITION_IMPACT_FACTOR_FOR_LIQUIDATIONS", address);

    w("### Position Impact");
    w();
    w("| Parameter | Value |");
    w("|---|---|");
    w(`| negativePositionImpactFactor | ${toFactor(negPosImpactFactor)} |`);
    w(`| positivePositionImpactFactor | ${toFactor(posPosImpactFactor)} |`);
    w(`| positionImpactExponentFactor | ${toFactor(posImpactExponent)} |`);
    w(`| negativeMaxPositionImpactFactor | ${toFactor(negMaxPosImpact)} |`);
    w(`| positiveMaxPositionImpactFactor | ${toFactor(posMaxPosImpact)} |`);
    w(`| maxPositionImpactFactorForLiquidations | ${toFactor(maxPosImpactForLiq)} |`);
    w();

    // ── Swap Fees ──
    const swapFeePos = await getMarketUint("SWAP_FEE_FACTOR", address, true);
    const swapFeeNeg = await getMarketUint("SWAP_FEE_FACTOR", address, false);
    const atomicSwapFee = await getMarketUintNoFlag("ATOMIC_SWAP_FEE_FACTOR", address);
    const atomicWithdrawalFee = await getMarketUintNoFlag("ATOMIC_WITHDRAWAL_FEE_FACTOR", address);

    w("### Swap Fees");
    w();
    w("| Parameter | Value |");
    w("|---|---|");
    w(`| swapFeeFactorForPositiveImpact | ${toRate(swapFeePos)} |`);
    w(`| swapFeeFactorForNegativeImpact | ${toRate(swapFeeNeg)} |`);
    w(`| atomicSwapFeeFactor | ${toRate(atomicSwapFee)} |`);
    w(`| atomicWithdrawalFeeFactor | ${toRate(atomicWithdrawalFee)} |`);
    w();

    // ── Swap Impact ──
    const negSwapImpact = await getMarketUint("SWAP_IMPACT_FACTOR", address, false);
    const posSwapImpact = await getMarketUint("SWAP_IMPACT_FACTOR", address, true);
    const swapImpactExponent = await getMarketUintNoFlag("SWAP_IMPACT_EXPONENT_FACTOR", address);

    w("### Swap Impact");
    w();
    w("| Parameter | Value |");
    w("|---|---|");
    w(`| negativeSwapImpactFactor | ${toFactor(negSwapImpact)} |`);
    w(`| positiveSwapImpactFactor | ${toFactor(posSwapImpact)} |`);
    w(`| swapImpactExponentFactor | ${toFactor(swapImpactExponent)} |`);
    w();

    // ── Borrowing ──
    const baseBorrowLong = await getMarketUint("BASE_BORROWING_FACTOR", address, true);
    const baseBorrowShort = await getMarketUint("BASE_BORROWING_FACTOR", address, false);
    const optimalUsageLong = await getMarketUint("OPTIMAL_USAGE_FACTOR", address, true);
    const optimalUsageShort = await getMarketUint("OPTIMAL_USAGE_FACTOR", address, false);
    const aboveOptimalLong = await getMarketUint("ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR", address, true);
    const aboveOptimalShort = await getMarketUint("ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR", address, false);
    const borrowingFactorLong = await getMarketUint("BORROWING_FACTOR", address, true);
    const borrowingFactorShort = await getMarketUint("BORROWING_FACTOR", address, false);
    const borrowingExponentLong = await getMarketUint("BORROWING_EXPONENT_FACTOR", address, true);
    const borrowingExponentShort = await getMarketUint("BORROWING_EXPONENT_FACTOR", address, false);

    w("### Borrowing");
    w();
    w("| Parameter | Longs | Shorts |");
    w("|---|---|---|");
    w(`| baseBorrowingFactor | ${toAnnualRate(baseBorrowLong)} | ${toAnnualRate(baseBorrowShort)} |`);
    w(`| optimalUsageFactor | ${toPercent(optimalUsageLong)} | ${toPercent(optimalUsageShort)} |`);
    w(`| aboveOptimalUsageBorrowingFactor | ${toAnnualRate(aboveOptimalLong)} | ${toAnnualRate(aboveOptimalShort)} |`);
    w(`| borrowingFactor | ${toAnnualRate(borrowingFactorLong)} | ${toAnnualRate(borrowingFactorShort)} |`);
    w(`| borrowingExponentFactor | ${toFactor(borrowingExponentLong)} | ${toFactor(borrowingExponentShort)} |`);
    w();

    // ── Funding ──
    const fundingFactor = await getMarketUintNoFlag("FUNDING_FACTOR", address);
    const fundingExponent = await getMarketUintNoFlag("FUNDING_EXPONENT_FACTOR", address);
    const fundingIncrease = await getMarketUintNoFlag("FUNDING_INCREASE_FACTOR_PER_SECOND", address);
    const fundingDecrease = await getMarketUintNoFlag("FUNDING_DECREASE_FACTOR_PER_SECOND", address);
    const thresholdStable = await getMarketUintNoFlag("THRESHOLD_FOR_STABLE_FUNDING", address);
    const thresholdDecrease = await getMarketUintNoFlag("THRESHOLD_FOR_DECREASE_FUNDING", address);
    const minFunding = await getMarketUintNoFlag("MIN_FUNDING_FACTOR_PER_SECOND", address);
    const maxFunding = await getMarketUintNoFlag("MAX_FUNDING_FACTOR_PER_SECOND", address);

    // ── Current Funding Rate ──
    const savedFundingFactorPerSecond = await getMarketIntNoFlag("SAVED_FUNDING_FACTOR_PER_SECOND", address);
    const fundingPerHour = (Number(savedFundingFactorPerSecond.toString()) / 1e30) * 3600 * 100;
    const fundingDirection = savedFundingFactorPerSecond.gt(0)
      ? "longs pay shorts"
      : savedFundingFactorPerSecond.lt(0)
      ? "shorts pay longs"
      : "neutral";

    w("### Funding");
    w();
    w(`**Current Hourly Funding Rate:** ${fundingPerHour.toFixed(6)}%/hr (${fundingDirection})`);
    w();
    w("| Parameter | Value |");
    w("|---|---|");
    w(`| savedFundingFactorPerSecond | ${savedFundingFactorPerSecond.toString()} |`);
    w(`| fundingFactor | ${toExponential(fundingFactor)} |`);
    w(`| fundingExponentFactor | ${toFactor(fundingExponent)} |`);
    w(`| fundingIncreaseFactorPerSecond | ${toExponential(fundingIncrease)} |`);
    w(`| fundingDecreaseFactorPerSecond | ${toExponential(fundingDecrease)} |`);
    w(`| thresholdForStableFunding | ${toRate(thresholdStable)} |`);
    w(`| thresholdForDecreaseFunding | ${toRate(thresholdDecrease)} |`);
    w(`| minFundingFactorPerSecond | ${toAnnualRate(minFunding)} |`);
    w(`| maxFundingFactorPerSecond | ${toAnnualRate(maxFunding)} |`);
    w();

    // ── Position Impact Pool ──
    const posImpactPoolDistRate = await getMarketUintNoFlag("POSITION_IMPACT_POOL_DISTRIBUTION_RATE", address);
    const minPosImpactPoolAmount = await getMarketUintNoFlag("MIN_POSITION_IMPACT_POOL_AMOUNT", address);

    w("### Position Impact Pool");
    w();
    w("| Parameter | Value |");
    w("|---|---|");
    w(`| positionImpactPoolDistributionRate | ${toExponential(posImpactPoolDistRate)} |`);
    w(`| minPositionImpactPoolAmount | ${toExponential(minPosImpactPoolAmount)} |`);
    w();

    // ── Virtual IDs ──
    w("### Virtual IDs");
    w();
    w("| Parameter | Value |");
    w("|---|---|");
    w(`| virtualMarketId | \`${virtualMarketId.toString()}\` |`);
    w(`| virtualTokenIdForIndexToken | \`${virtualTokenIdForIndexToken.toString()}\` |`);
    w();

    w("---");
    w();
  }

  // Write markdown file
  const outPath = path.resolve(__dirname, "..", "market-parameters.md");
  fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
  console.log(`\nMarkdown written to ${outPath}`);
}

main().catch(console.error);
