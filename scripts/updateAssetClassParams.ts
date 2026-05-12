import { ethers } from "hardhat";
import { BigNumber, CallOverrides } from "ethers";

// ── Contract addresses (hardcoded to avoid stale deployment artifacts) ──
const DATASTORE_ADDRESS = "0x0cA7D71845cb485B7593bBdCbcac93d82d52d053";
const CONFIG_ADDRESS = "0x2f1D2A3e7aBaf8dde3E8A5e404f468081Cb5cB99";
const MULTICALL3_ADDRESS = "0x295B86560221c6cb2Bed126Cf6D69cC6aC03e0C4";

const SECONDS_PER_DAY = 86400;

// ── Helpers ──
function expandDecimals(n: number | BigNumber, decimals: number): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(decimals));
}

function hashString(s: string): string {
  return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], [s]));
}

function encodeData(types: string[], values: any[]): string {
  return ethers.utils.hexlify(ethers.utils.defaultAbiCoder.encode(types, values));
}

function getFullKey(baseKey: string, keyData: string): string {
  if (keyData === "0x") return baseKey;
  const keyArray = ethers.utils.concat([ethers.utils.arrayify(baseKey), ethers.utils.arrayify(keyData)]);
  return ethers.utils.keccak256(keyArray);
}

// ── Base keys ──
const KEYS = {
  POSITION_IMPACT_EXPONENT_FACTOR: hashString("POSITION_IMPACT_EXPONENT_FACTOR"),
  POSITION_IMPACT_FACTOR: hashString("POSITION_IMPACT_FACTOR"),
  BASE_BORROWING_FACTOR: hashString("BASE_BORROWING_FACTOR"),
  BORROWING_FACTOR: hashString("BORROWING_FACTOR"),
  BORROWING_EXPONENT_FACTOR: hashString("BORROWING_EXPONENT_FACTOR"),
  OPTIMAL_USAGE_FACTOR: hashString("OPTIMAL_USAGE_FACTOR"),
  ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR: hashString("ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR"),
  SKIP_BORROWING_FEE_FOR_SMALLER_SIDE: hashString("SKIP_BORROWING_FEE_FOR_SMALLER_SIDE"),
  FUNDING_FACTOR: hashString("FUNDING_FACTOR"),
  FUNDING_EXPONENT_FACTOR: hashString("FUNDING_EXPONENT_FACTOR"),
  FUNDING_INCREASE_FACTOR_PER_SECOND: hashString("FUNDING_INCREASE_FACTOR_PER_SECOND"),
  MIN_FUNDING_FACTOR_PER_SECOND: hashString("MIN_FUNDING_FACTOR_PER_SECOND"),
  MAX_FUNDING_FACTOR_PER_SECOND: hashString("MAX_FUNDING_FACTOR_PER_SECOND"),
  MAX_OPEN_INTEREST: hashString("MAX_OPEN_INTEREST"),
  LIQUIDATION_FEE_FACTOR: hashString("LIQUIDATION_FEE_FACTOR"),
  POSITION_FEE_FACTOR: hashString("POSITION_FEE_FACTOR"),
  MIN_COLLATERAL_FACTOR: hashString("MIN_COLLATERAL_FACTOR"),
  MIN_MAINTAIN_COLLATERAL_FACTOR: hashString("MIN_MAINTAIN_COLLATERAL_FACTOR"),
};

// ── Markets by asset class ──
const FX_MARKETS: Record<string, string> = {
  "EUR/USD": "0x7054eb596aCF4fC1C0686C9B2cdAC4aE6c6D0F33",
  "GBP/USD": "0xa09b59adf15B4ED98a099441b84Ff1eABf71B548",
  "USD/JPY": "0xD847a999faCe1f862120117C33ae8faBA768fD4b",
};

const COMMODITY_MARKETS: Record<string, string> = {
  "GOLD/USD": "0x89c3B33bEE4b9cD1B246BE44aDcEd870F74637a3",
  "XAG/USD": "0x6D260c4229dBb55a0a91041b5c07b320fdD6303B",
  "WTI/USD": "0x80d260188c592F7F175F843EDc257b6A6Af6e5eF",
};

const CRYPTO_MARKETS: Record<string, string> = {
  "WBTC/USD": "0x63D05Da932541380df8d9eE20D8FdB4B02849398",
  "WETH/USD": "0x23F40e3279685413b252A6944AF9a0641D3aa6ce",
  "TAO/USD": "0x24061f45f954D880dCa0Ce122FFA60Cfd5447B5A",
};

// ── Target values (all in 30-decimal fixed-point) ──

// Shared across all asset classes
const COMMON_PARAMS = {
  positionImpactExponentFactor: expandDecimals(145, 28), // 1.45
  positivePositionImpactFactor: expandDecimals(8, 22), // 0.00000008
  negativePositionImpactFactor: expandDecimals(1, 23), // 0.0000001
  baseBorrowingFactor: BigNumber.from(0), // 0
  // 0.000000056 / 86400
  borrowingFactor: expandDecimals(56, 21).div(SECONDS_PER_DAY),
  borrowingExponentFactor: expandDecimals(152, 28), // 1.52
  optimalUsageFactor: BigNumber.from(0), // 0
  aboveOptimalUsageBorrowingFactor: BigNumber.from(0), // 0
  // 0.000132 / 86400
  fundingFactor: expandDecimals(132, 24).div(SECONDS_PER_DAY),
  fundingExponentFactor: expandDecimals(11, 29), // 1.1
  fundingIncreaseFactorPerSecond: BigNumber.from(0), // 0 (disable adaptive funding)
  maxOpenInterest: expandDecimals(1_000_000_000, 30), // $1B
  liquidationFeeFactor: expandDecimals(1, 29), // 0.1
};

// Per-class position fees
const FX_FEES = {
  positionFeeFactorForPositiveImpact: expandDecimals(1, 26), // 0.0001
  positionFeeFactorForNegativeImpact: expandDecimals(15, 25), // 0.00015
};

const COMMODITY_FEES = {
  positionFeeFactorForPositiveImpact: expandDecimals(5, 25), // 0.00005
  positionFeeFactorForNegativeImpact: expandDecimals(1, 26), // 0.0001
};

const CRYPTO_FEES = {
  positionFeeFactorForPositiveImpact: expandDecimals(2, 26), // 0.0002
  positionFeeFactorForNegativeImpact: expandDecimals(25, 25), // 0.00025
};

// Per-class collateral factors (minCollateralFactor & minMaintainCollateralFactor)
const FX_COLLATERAL = {
  minCollateralFactor: expandDecimals(1333, 24), // 0.001333
  minMaintainCollateralFactor: expandDecimals(1333, 24), // 0.001333
};

const COMMODITY_COLLATERAL = {
  minCollateralFactor: expandDecimals(3333, 24), // 0.003333
  minMaintainCollateralFactor: expandDecimals(3333, 24), // 0.003333
};

const CRYPTO_COLLATERAL = {
  minCollateralFactor: expandDecimals(6666, 24), // 0.006666
  minMaintainCollateralFactor: expandDecimals(6666, 24), // 0.006666
};

// Per-class funding rate bounds (min/max funding factor per second)
const SECONDS_PER_YEAR = 31536000;

const FX_FUNDING_RATES = {
  minFundingFactorPerSecond: expandDecimals(1, 28).div(SECONDS_PER_YEAR), // 1%/yr
  maxFundingFactorPerSecond: expandDecimals(90, 28).div(SECONDS_PER_YEAR), // 90%/yr
};

const COMMODITY_FUNDING_RATES = {
  minFundingFactorPerSecond: expandDecimals(1, 28).div(SECONDS_PER_YEAR), // 1%/yr
  maxFundingFactorPerSecond: expandDecimals(90, 28).div(SECONDS_PER_YEAR), // 90%/yr
};

const CRYPTO_FUNDING_RATES = {
  minFundingFactorPerSecond: expandDecimals(1, 28).div(SECONDS_PER_YEAR), // 1%/yr
  maxFundingFactorPerSecond: expandDecimals(90, 28).div(SECONDS_PER_YEAR), // 90%/yr
};

// ── Parameter update entry ──
interface ConfigEntry {
  type: "uint" | "bool";
  baseKey: string;
  keyData: string;
  value: BigNumber | boolean;
  label: string;
  skipConfigValidation?: boolean;
}

function buildMarketEntries(
  marketName: string,
  marketToken: string,
  fees: { positionFeeFactorForPositiveImpact: BigNumber; positionFeeFactorForNegativeImpact: BigNumber },
  collateral: { minCollateralFactor: BigNumber; minMaintainCollateralFactor: BigNumber },
  fundingRates: { minFundingFactorPerSecond: BigNumber; maxFundingFactorPerSecond: BigNumber }
): ConfigEntry[] {
  const m = (types: string[], values: any[]) => encodeData(types, values);
  const entries: ConfigEntry[] = [];

  // ── Position Impact (no direction flag) ──
  entries.push({
    type: "uint",
    baseKey: KEYS.POSITION_IMPACT_EXPONENT_FACTOR,
    keyData: m(["address"], [marketToken]),
    value: COMMON_PARAMS.positionImpactExponentFactor,
    label: `positionImpactExponentFactor ${marketName}`,
  });

  // ── Position Impact Factors (isPositive flag) ──
  entries.push({
    type: "uint",
    baseKey: KEYS.POSITION_IMPACT_FACTOR,
    keyData: m(["address", "bool"], [marketToken, true]),
    value: COMMON_PARAMS.positivePositionImpactFactor,
    label: `positivePositionImpactFactor ${marketName}`,
  });
  entries.push({
    type: "uint",
    baseKey: KEYS.POSITION_IMPACT_FACTOR,
    keyData: m(["address", "bool"], [marketToken, false]),
    value: COMMON_PARAMS.negativePositionImpactFactor,
    label: `negativePositionImpactFactor ${marketName}`,
  });

  // ── Borrowing (isLong flag, same for both sides) ──
  for (const isLong of [true, false]) {
    const side = isLong ? "Long" : "Short";

    entries.push({
      type: "uint",
      baseKey: KEYS.BASE_BORROWING_FACTOR,
      keyData: m(["address", "bool"], [marketToken, isLong]),
      value: COMMON_PARAMS.baseBorrowingFactor,
      label: `baseBorrowingFactor${side} ${marketName}`,
    });

    entries.push({
      type: "uint",
      baseKey: KEYS.BORROWING_FACTOR,
      keyData: m(["address", "bool"], [marketToken, isLong]),
      value: COMMON_PARAMS.borrowingFactor,
      label: `borrowingFactor${side} ${marketName}`,
    });

    entries.push({
      type: "uint",
      baseKey: KEYS.BORROWING_EXPONENT_FACTOR,
      keyData: m(["address", "bool"], [marketToken, isLong]),
      value: COMMON_PARAMS.borrowingExponentFactor,
      label: `borrowingExponentFactor${side} ${marketName}`,
    });

    entries.push({
      type: "uint",
      baseKey: KEYS.OPTIMAL_USAGE_FACTOR,
      keyData: m(["address", "bool"], [marketToken, isLong]),
      value: COMMON_PARAMS.optimalUsageFactor,
      label: `optimalUsageFactor${side} ${marketName}`,
    });

    entries.push({
      type: "uint",
      baseKey: KEYS.ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR,
      keyData: m(["address", "bool"], [marketToken, isLong]),
      value: COMMON_PARAMS.aboveOptimalUsageBorrowingFactor,
      label: `aboveOptimalUsageBorrowingFactor${side} ${marketName}`,
    });
  }

  // ── Funding (no direction flag) ──
  entries.push({
    type: "uint",
    baseKey: KEYS.FUNDING_FACTOR,
    keyData: m(["address"], [marketToken]),
    value: COMMON_PARAMS.fundingFactor,
    label: `fundingFactor ${marketName}`,
  });
  entries.push({
    type: "uint",
    baseKey: KEYS.FUNDING_EXPONENT_FACTOR,
    keyData: m(["address"], [marketToken]),
    value: COMMON_PARAMS.fundingExponentFactor,
    label: `fundingExponentFactor ${marketName}`,
  });
  entries.push({
    type: "uint",
    baseKey: KEYS.FUNDING_INCREASE_FACTOR_PER_SECOND,
    keyData: m(["address"], [marketToken]),
    value: COMMON_PARAMS.fundingIncreaseFactorPerSecond,
    label: `fundingIncreaseFactorPerSecond ${marketName}`,
  });

  // ── Max Open Interest (isLong flag) ──
  for (const isLong of [true, false]) {
    entries.push({
      type: "uint",
      baseKey: KEYS.MAX_OPEN_INTEREST,
      keyData: m(["address", "bool"], [marketToken, isLong]),
      value: COMMON_PARAMS.maxOpenInterest,
      label: `maxOpenInterest${isLong ? "Long" : "Short"} ${marketName}`,
    });
  }

  // ── Liquidation Fee (no direction flag) ──
  entries.push({
    type: "uint",
    baseKey: KEYS.LIQUIDATION_FEE_FACTOR,
    keyData: m(["address"], [marketToken]),
    value: COMMON_PARAMS.liquidationFeeFactor,
    label: `liquidationFeeFactor ${marketName}`,
  });

  // ── Position Fees (isPositive flag) ──
  entries.push({
    type: "uint",
    baseKey: KEYS.POSITION_FEE_FACTOR,
    keyData: m(["address", "bool"], [marketToken, true]),
    value: fees.positionFeeFactorForPositiveImpact,
    label: `positionFeeFactorForPositiveImpact ${marketName}`,
  });
  entries.push({
    type: "uint",
    baseKey: KEYS.POSITION_FEE_FACTOR,
    keyData: m(["address", "bool"], [marketToken, false]),
    value: fees.positionFeeFactorForNegativeImpact,
    label: `positionFeeFactorForNegativeImpact ${marketName}`,
  });

  // ── Collateral Factors (no direction flag) ──
  entries.push({
    type: "uint",
    baseKey: KEYS.MIN_COLLATERAL_FACTOR,
    keyData: m(["address"], [marketToken]),
    value: collateral.minCollateralFactor,
    label: `minCollateralFactor ${marketName}`,
  });
  entries.push({
    type: "uint",
    baseKey: KEYS.MIN_MAINTAIN_COLLATERAL_FACTOR,
    keyData: m(["address"], [marketToken]),
    value: collateral.minMaintainCollateralFactor,
    label: `minMaintainCollateralFactor ${marketName}`,
  });

  // ── Funding Rate Bounds (no direction flag, not in Config allowlist) ──
  entries.push({
    type: "uint",
    baseKey: KEYS.MIN_FUNDING_FACTOR_PER_SECOND,
    keyData: m(["address"], [marketToken]),
    value: fundingRates.minFundingFactorPerSecond,
    label: `minFundingFactorPerSecond ${marketName}`,
    skipConfigValidation: true,
  });
  entries.push({
    type: "uint",
    baseKey: KEYS.MAX_FUNDING_FACTOR_PER_SECOND,
    keyData: m(["address"], [marketToken]),
    value: fundingRates.maxFundingFactorPerSecond,
    label: `maxFundingFactorPerSecond ${marketName}`,
    skipConfigValidation: true,
  });

  return entries;
}

async function main() {
  const write = process.env.WRITE === "true";

  const dataStore = await ethers.getContractAt("DataStore", DATASTORE_ADDRESS);
  const config = await ethers.getContractAt("Config", CONFIG_ADDRESS);
  const multicall = await ethers.getContractAt("Multicall3", MULTICALL3_ADDRESS);

  // Verify addresses
  const configDataStore = await config.dataStore();
  console.log(`Config's DataStore:  ${configDataStore} (stale, used for validation only)`);
  console.log(`Real DataStore:      ${DATASTORE_ADDRESS} (where values are actually written)`);

  // ── Build all config entries ──
  const allEntries: ConfigEntry[] = [];

  // Global: skipBorrowingFeeForSmallerSide
  allEntries.push({
    type: "bool",
    baseKey: KEYS.SKIP_BORROWING_FEE_FOR_SMALLER_SIDE,
    keyData: "0x",
    value: true,
    label: "skipBorrowingFeeForSmallerSide (global)",
  });

  // Per-market entries
  for (const [name, addr] of Object.entries(FX_MARKETS)) {
    allEntries.push(...buildMarketEntries(name, addr, FX_FEES, FX_COLLATERAL, FX_FUNDING_RATES));
  }
  for (const [name, addr] of Object.entries(COMMODITY_MARKETS)) {
    allEntries.push(...buildMarketEntries(name, addr, COMMODITY_FEES, COMMODITY_COLLATERAL, COMMODITY_FUNDING_RATES));
  }
  for (const [name, addr] of Object.entries(CRYPTO_MARKETS)) {
    allEntries.push(...buildMarketEntries(name, addr, CRYPTO_FEES, CRYPTO_COLLATERAL, CRYPTO_FUNDING_RATES));
  }

  console.log(`\nTotal config entries to check: ${allEntries.length}`);

  // ── Read current values via multicall ──
  console.log("Reading current on-chain values...");
  const multicallReadParams = allEntries.map((entry) => {
    const fullKey = getFullKey(entry.baseKey, entry.keyData);
    const method = entry.type === "bool" ? "getBool" : "getUint";
    return {
      target: DATASTORE_ADDRESS,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData(method, [fullKey]),
    };
  });

  const results = await multicall.callStatic.aggregate3(multicallReadParams);

  // ── Compare and build write params ──
  // configWriteParams: sent to stale Config for validation (range checks, key allowlist)
  // dataStoreWriteParams: sent to real DataStore to actually persist values
  const configWriteParams: string[] = [];
  const dataStoreWriteParams: { key: string; value: BigNumber | boolean; type: "uint" | "bool" }[] = [];
  let changedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i];
    const returnData = results[i].returnData;
    const fullKey = getFullKey(entry.baseKey, entry.keyData);

    if (entry.type === "bool") {
      const currentValue = ethers.utils.defaultAbiCoder.decode(["bool"], returnData)[0] as boolean;
      if (currentValue !== entry.value) {
        console.log(`  CHANGE: ${entry.label}: ${currentValue} -> ${entry.value}`);
        if (!entry.skipConfigValidation) {
          configWriteParams.push(
            config.interface.encodeFunctionData("setBool", [entry.baseKey, entry.keyData, entry.value])
          );
        }
        dataStoreWriteParams.push({ key: fullKey, value: entry.value as boolean, type: "bool" });
        changedCount++;
      } else {
        skippedCount++;
      }
    } else {
      const currentValue = BigNumber.from(returnData);
      const targetValue = entry.value as BigNumber;
      if (!currentValue.eq(targetValue)) {
        const changeStr = currentValue.gt(0)
          ? ` (${(Number(targetValue.toString()) / Number(currentValue.toString())).toFixed(4)}x)`
          : "";
        console.log(`  CHANGE: ${entry.label}: ${currentValue.toString()} -> ${targetValue.toString()}${changeStr}`);
        if (!entry.skipConfigValidation) {
          configWriteParams.push(
            config.interface.encodeFunctionData("setUint", [entry.baseKey, entry.keyData, targetValue])
          );
        }
        dataStoreWriteParams.push({ key: fullKey, value: targetValue, type: "uint" });
        changedCount++;
      } else {
        skippedCount++;
      }
    }
  }

  console.log(`\nSummary: ${changedCount} changes, ${skippedCount} already correct`);

  if (dataStoreWriteParams.length === 0) {
    console.log("No changes needed. All parameters already match target values.");
    return;
  }

  // ── Print target values for verification ──
  console.log("\n── Target Values ──");
  console.log(`  positionImpactExponentFactor:       ${COMMON_PARAMS.positionImpactExponentFactor.toString()} (1.45)`);
  console.log(
    `  positivePositionImpactFactor:        ${COMMON_PARAMS.positivePositionImpactFactor.toString()} (0.00000008)`
  );
  console.log(
    `  negativePositionImpactFactor:        ${COMMON_PARAMS.negativePositionImpactFactor.toString()} (0.0000001)`
  );
  console.log(`  baseBorrowingFactor:                 ${COMMON_PARAMS.baseBorrowingFactor.toString()} (0)`);
  console.log(`  borrowingFactor:                     ${COMMON_PARAMS.borrowingFactor.toString()} (0.000000036/day)`);
  console.log(`  borrowingExponentFactor:             ${COMMON_PARAMS.borrowingExponentFactor.toString()} (1.52)`);
  console.log(`  optimalUsageFactor:                  ${COMMON_PARAMS.optimalUsageFactor.toString()} (0)`);
  console.log(
    `  aboveOptimalUsageBorrowingFactor:     ${COMMON_PARAMS.aboveOptimalUsageBorrowingFactor.toString()} (0)`
  );
  console.log(`  fundingFactor:                       ${COMMON_PARAMS.fundingFactor.toString()} (0.000000432/day)`);
  console.log(`  fundingExponentFactor:               ${COMMON_PARAMS.fundingExponentFactor.toString()} (1.48)`);
  console.log(`  maxOpenInterest:                     ${COMMON_PARAMS.maxOpenInterest.toString()} ($1B)`);
  console.log(`  liquidationFeeFactor:                ${COMMON_PARAMS.liquidationFeeFactor.toString()} (0.1)`);
  console.log(`  skipBorrowingFeeForSmallerSide:      true`);
  console.log(
    `  FX posFeePosImpact:                  ${FX_FEES.positionFeeFactorForPositiveImpact.toString()} (0.0001)`
  );
  console.log(
    `  FX posFeeNegImpact:                  ${FX_FEES.positionFeeFactorForNegativeImpact.toString()} (0.00015)`
  );
  console.log(
    `  Commodity posFeePosImpact:            ${COMMODITY_FEES.positionFeeFactorForPositiveImpact.toString()} (0.00005)`
  );
  console.log(
    `  Commodity posFeeNegImpact:            ${COMMODITY_FEES.positionFeeFactorForNegativeImpact.toString()} (0.0001)`
  );
  console.log(
    `  Crypto posFeePosImpact:               ${CRYPTO_FEES.positionFeeFactorForPositiveImpact.toString()} (0.0002)`
  );
  console.log(
    `  Crypto posFeeNegImpact:               ${CRYPTO_FEES.positionFeeFactorForNegativeImpact.toString()} (0.00025)`
  );
  console.log(`  FX minCollateralFactor:               ${FX_COLLATERAL.minCollateralFactor.toString()} (0.001333)`);
  console.log(
    `  FX minMaintainCollateralFactor:       ${FX_COLLATERAL.minMaintainCollateralFactor.toString()} (0.001333)`
  );
  console.log(
    `  Commodity minCollateralFactor:         ${COMMODITY_COLLATERAL.minCollateralFactor.toString()} (0.003333)`
  );
  console.log(
    `  Commodity minMaintainCollateralFactor: ${COMMODITY_COLLATERAL.minMaintainCollateralFactor.toString()} (0.003333)`
  );
  console.log(
    `  Crypto minCollateralFactor:            ${CRYPTO_COLLATERAL.minCollateralFactor.toString()} (0.006666)`
  );
  console.log(
    `  Crypto minMaintainCollateralFactor:    ${CRYPTO_COLLATERAL.minMaintainCollateralFactor.toString()} (0.006666)`
  );
  console.log(
    `  FX minFundingFactorPerSecond:          ${FX_FUNDING_RATES.minFundingFactorPerSecond.toString()} (1%/yr)`
  );
  console.log(
    `  FX maxFundingFactorPerSecond:          ${FX_FUNDING_RATES.maxFundingFactorPerSecond.toString()} (90%/yr)`
  );
  console.log(
    `  Commodity minFundingFactorPerSecond:    ${COMMODITY_FUNDING_RATES.minFundingFactorPerSecond.toString()} (1%/yr)`
  );
  console.log(
    `  Commodity maxFundingFactorPerSecond:    ${COMMODITY_FUNDING_RATES.maxFundingFactorPerSecond.toString()} (90%/yr)`
  );
  console.log(
    `  Crypto minFundingFactorPerSecond:       ${CRYPTO_FUNDING_RATES.minFundingFactorPerSecond.toString()} (1%/yr)`
  );
  console.log(
    `  Crypto maxFundingFactorPerSecond:       ${CRYPTO_FUNDING_RATES.maxFundingFactorPerSecond.toString()} (90%/yr)`
  );

  if (!write) {
    console.log(`\nDry run complete. ${dataStoreWriteParams.length} changes would be applied.`);
    console.log(
      "Run with WRITE=true to execute: WRITE=true npx hardhat run scripts/updateAssetClassParams.ts --network baseSepolia"
    );
    return;
  }

  // ── Step 1: Validate via stale Config (range checks + key allowlist) ──
  console.log(`\nStep 1: Validating ${configWriteParams.length} params via Config contract...`);
  const BATCH_SIZE = 100;
  for (let i = 0; i < configWriteParams.length; i += BATCH_SIZE) {
    const batch = configWriteParams.slice(i, i + BATCH_SIZE);
    try {
      await config.callStatic.multicall(batch);
      console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} validated OK`);
    } catch (err: any) {
      console.error(`\n  Validation FAILED on batch ${Math.floor(i / BATCH_SIZE) + 1}!`);
      console.error(`  Config's range checks or key allowlist rejected a value.`);
      console.error(`  Error: ${err.reason || err.message}`);
      console.error(`  Aborting — no changes written to real DataStore.`);
      process.exit(1);
    }
  }
  console.log("  All validations passed.");

  // ── Step 2: Write directly to real DataStore ──
  console.log(`\nStep 2: Writing ${dataStoreWriteParams.length} params to real DataStore...`);
  const signer = (await ethers.getSigners())[0];
  let nonce = await signer.getTransactionCount("pending");
  console.log(`  Starting nonce: ${nonce}`);

  const TX_BATCH = 20;
  for (let i = 0; i < dataStoreWriteParams.length; i += TX_BATCH) {
    const batch = dataStoreWriteParams.slice(i, i + TX_BATCH);
    const batchNum = Math.floor(i / TX_BATCH) + 1;
    console.log(`  Sending batch ${batchNum} (${batch.length} txs, nonces ${nonce}-${nonce + batch.length - 1})...`);

    // Send all txs with explicit nonces
    const txPromises = batch.map((param) => {
      const opts = { nonce: nonce++ };
      if (param.type === "bool") {
        return dataStore.setBool(param.key, param.value as boolean, opts);
      } else {
        return dataStore.setUint(param.key, param.value as BigNumber, opts);
      }
    });
    const txs = await Promise.all(txPromises);

    // Wait for all receipts
    const receipts = await Promise.all(txs.map((tx) => tx.wait(1)));
    console.log(
      `  Batch ${batchNum} confirmed (${receipts.length} txs, last block ${receipts[receipts.length - 1].blockNumber})`
    );
  }

  console.log("\nAll updates applied successfully to real DataStore.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
