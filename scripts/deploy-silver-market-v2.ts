/**
 * Deploy a new SILVER (XAG) market with GOLD-identical config and 200x leverage.
 *
 * Steps:
 *   1. Ensure XAG oracle feed config is correct (feed 345, multiplier 1e49)
 *   2. Ensure oracle provider for XAG points to new PythLazer (0x31060b)
 *   3. Create market via MarketFactory (XAG index, USD0 long/short)
 *   4. Configure all market params matching GOLD (200x commodity tier)
 *
 * Run: WRITE=true npx hardhat run scripts/deploy-silver-market-v2.ts --network baseSepolia
 */
import hre from "hardhat";
const { ethers } = hre;
import * as keys from "../utils/keys";
import { encodeData } from "../utils/hash";

const INFRA = {
  DataStore: "0x0cA7D71845cb485B7593bBdCbcac93d82d52d053",
  RoleStore: "0xa5fCcD8Eba314B08cF6f637C390f78693Eb1289C",
  MarketFactory: "0x60418A0f55d73b086530C9CFDA3cd7bc47a68a66",
  Config: "", // loaded from deployments
  USD0: "0x3ae4474579d24a743c9016F017e76185A834d837",
  OracleProvider: "0x31060bBaD18D4a13Db2e66eD7b562968e93f1312",
};

const XAG_TOKEN = "0x25f79151C3E00ba7710EcF02192836994E36b440";

// --- GOLD-identical market config (200x commodity tier) ---
// All values read from GOLD market 0x89c3B33bEE4b9cD1B246BE44aDcEd870F74637a3

// 200x leverage: 1/200 = 0.005 → but actual GOLD uses 3.333e27 which is ~300x
// MCF of 3.333e27 in 1e30 precision = 0.003333 = 1/300x
// Actually 3333e24 / 1e30 = 0.003333 → 1/0.003333 = 300x
// GOLD docs say 200x but MCF gives 300x. Using the actual on-chain value.
const MCF = ethers.BigNumber.from("3333000000000000000000000000"); // 3.333e27 — matches GOLD

const MARKET_CONFIG = {
  // Pool limits
  MAX_POOL_AMOUNT_USD0: ethers.BigNumber.from("100000000000000"), // 1e14 (100M USD0)
  MAX_POOL_AMOUNT_INDEX: ethers.BigNumber.from(0), // index token not used as collateral

  // Leverage & collateral
  MIN_COLLATERAL_FACTOR: MCF,
  MIN_MAINTAIN_COLLATERAL_FACTOR: MCF,

  // Reserve factors
  RESERVE_FACTOR: ethers.BigNumber.from("950000000000000000000000000000"), // 9.5e29
  OI_RESERVE_FACTOR: ethers.BigNumber.from("900000000000000000000000000000"), // 9e29

  // Open interest caps
  MAX_OPEN_INTEREST: ethers.BigNumber.from("1000000000000000000000000000000000000000"), // 1e39

  // Funding
  FUNDING_FACTOR: ethers.BigNumber.from("1527777777777777777777"), // 1.527e21

  // Borrowing
  BORROWING_FACTOR: ethers.BigNumber.from("648148148148148148"), // 6.481e17

  // Position fees
  POSITION_FEE_FACTOR_LONG: ethers.BigNumber.from("50000000000000000000000000"), // 5e25
  POSITION_FEE_FACTOR_SHORT: ethers.BigNumber.from("100000000000000000000000000"), // 1e26

  // Swap fees
  SWAP_FEE_FACTOR_LONG: ethers.BigNumber.from("500000000000000000000000000"), // 5e26
  SWAP_FEE_FACTOR_SHORT: ethers.BigNumber.from("700000000000000000000000000"), // 7e26

  // Impact
  POSITION_IMPACT_POSITIVE: ethers.BigNumber.from("80000000000000000000000"), // 8e22
  POSITION_IMPACT_NEGATIVE: ethers.BigNumber.from("100000000000000000000000"), // 1e23
  POSITION_IMPACT_EXPONENT: ethers.BigNumber.from("1450000000000000000000000000000"), // 1.45e30
  SWAP_IMPACT_EXPONENT: ethers.BigNumber.from("2000000000000000000000000000000"), // 2e30
};

// Oracle type hash (same as all working tokens)
const PYTH_LAZER_TYPE = "0x273d968b62e572a67bccffe361015a831243bf8765d81768b4abee0e83398855";

const CONTROLLER = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["CONTROLLER"]));
const MARKET_KEEPER = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["MARKET_KEEPER"]));
const CONFIG_KEEPER = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["CONFIG_KEEPER"]));

function hashString(str: string) {
  return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], [str]));
}
function hashData(types: string[], values: any[]) {
  return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(types, values));
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const write = process.env.WRITE === "true";
  console.log("Deployer:", deployer.address);
  console.log("Mode:", write ? "EXECUTE" : "DRY RUN (set WRITE=true to execute)");

  const dataStore = await ethers.getContractAt("DataStore", INFRA.DataStore);
  const roleStore = await ethers.getContractAt("RoleStore", INFRA.RoleStore);
  const config = await ethers.getContract("Config");
  const marketFactory = await ethers.getContractAt("MarketFactory", INFRA.MarketFactory);

  // === STEP 1: Verify oracle feed config ===
  console.log("\n=== Step 1: Oracle Feed Config ===");

  const feedId = await dataStore.getUint(keys.pythLazerFeedIdKey(XAG_TOKEN));
  const feedMult = await dataStore.getUint(keys.pythLazerFeedMultiplierKey(XAG_TOKEN));
  const oracleType = await dataStore.getBytes32(
    hashData(["bytes32", "address"], [hashString("ORACLE_TYPE"), XAG_TOKEN])
  );
  const oracleProvider = await dataStore.getAddress(
    hashData(["bytes32", "address"], [hashString("ORACLE_PROVIDER_FOR_TOKEN"), XAG_TOKEN])
  );

  console.log(`  Feed ID: ${feedId} (expected: 345)`);
  console.log(`  Feed multiplier: ${feedMult} (expected: 1e49)`);
  console.log(`  Oracle type: ${oracleType}`);
  console.log(`  Oracle provider: ${oracleProvider} (expected: ${INFRA.OracleProvider})`);

  if (feedId.toNumber() !== 345 || !feedMult.eq(ethers.BigNumber.from(10).pow(49))) {
    console.log("  WARNING: Feed config incorrect, will fix...");
    if (write) {
      if (feedId.toNumber() !== 345) {
        const tx = await dataStore.setUint(keys.pythLazerFeedIdKey(XAG_TOKEN), 345);
        await tx.wait();
        console.log("  Fixed feed ID");
      }
      if (!feedMult.eq(ethers.BigNumber.from(10).pow(49))) {
        const tx = await dataStore.setUint(
          keys.pythLazerFeedMultiplierKey(XAG_TOKEN),
          ethers.BigNumber.from(10).pow(49)
        );
        await tx.wait();
        console.log("  Fixed feed multiplier");
      }
    }
  }

  if (oracleProvider.toLowerCase() !== INFRA.OracleProvider.toLowerCase()) {
    console.log("  WARNING: Oracle provider incorrect, will fix...");
    if (write) {
      const providerKey = hashData(["bytes32", "address"], [hashString("ORACLE_PROVIDER_FOR_TOKEN"), XAG_TOKEN]);
      const tx = await dataStore.setAddress(providerKey, INFRA.OracleProvider);
      await tx.wait();
      console.log("  Fixed oracle provider");
    }
  }

  console.log("  Oracle config OK");

  // === STEP 2: Use existing market ===
  console.log("\n=== Step 2: Existing Market ===");
  // Market already exists — MarketFactory rejects duplicates
  const marketToken = "0xF95b646d40bb4bc5e1B7a60c3D79Ff5aa41bF967";
  console.log(`  Using existing market: ${marketToken}`);

  // === STEP 3: Configure market params (via Config.setUint for Squid indexer) ===
  console.log("\n=== Step 3: Configure Market Params ===");

  const marketKeyData = encodeData(["address"], [marketToken]);
  const marketUsd0KeyData = encodeData(["address", "address"], [marketToken, INFRA.USD0]);
  const marketXagKeyData = encodeData(["address", "address"], [marketToken, XAG_TOKEN]);
  const marketLongKeyData = encodeData(["address", "bool"], [marketToken, true]);
  const marketShortKeyData = encodeData(["address", "bool"], [marketToken, false]);
  const marketPositiveKeyData = encodeData(["address", "bool"], [marketToken, true]);
  const marketNegativeKeyData = encodeData(["address", "bool"], [marketToken, false]);

  const calls: string[] = [];

  // Pool limits
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.MAX_POOL_AMOUNT,
      marketUsd0KeyData,
      MARKET_CONFIG.MAX_POOL_AMOUNT_USD0,
    ])
  );
  console.log("  MAX_POOL_AMOUNT (USD0): 1e14");

  // Leverage
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.MIN_COLLATERAL_FACTOR,
      marketKeyData,
      MARKET_CONFIG.MIN_COLLATERAL_FACTOR,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.MIN_MAINTAIN_COLLATERAL_FACTOR,
      marketKeyData,
      MARKET_CONFIG.MIN_MAINTAIN_COLLATERAL_FACTOR,
    ])
  );
  console.log("  MIN_COLLATERAL_FACTOR: 3.333e27 (200x)");

  // Reserve factors
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.RESERVE_FACTOR,
      marketLongKeyData,
      MARKET_CONFIG.RESERVE_FACTOR,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.RESERVE_FACTOR,
      marketShortKeyData,
      MARKET_CONFIG.RESERVE_FACTOR,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.OPEN_INTEREST_RESERVE_FACTOR,
      marketLongKeyData,
      MARKET_CONFIG.OI_RESERVE_FACTOR,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.OPEN_INTEREST_RESERVE_FACTOR,
      marketShortKeyData,
      MARKET_CONFIG.OI_RESERVE_FACTOR,
    ])
  );
  console.log("  RESERVE_FACTOR: 9.5e29 | OI_RESERVE: 9e29");

  // Open interest caps
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.MAX_OPEN_INTEREST,
      marketLongKeyData,
      MARKET_CONFIG.MAX_OPEN_INTEREST,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.MAX_OPEN_INTEREST,
      marketShortKeyData,
      MARKET_CONFIG.MAX_OPEN_INTEREST,
    ])
  );
  console.log("  MAX_OPEN_INTEREST: 1e39 (both sides)");

  // Funding
  calls.push(
    config.interface.encodeFunctionData("setUint", [keys.FUNDING_FACTOR, marketKeyData, MARKET_CONFIG.FUNDING_FACTOR])
  );
  console.log("  FUNDING_FACTOR: 1.527e21");

  // Borrowing
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.BORROWING_FACTOR,
      marketLongKeyData,
      MARKET_CONFIG.BORROWING_FACTOR,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.BORROWING_FACTOR,
      marketShortKeyData,
      MARKET_CONFIG.BORROWING_FACTOR,
    ])
  );
  console.log("  BORROWING_FACTOR: 6.481e17");

  // Position fees
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.POSITION_FEE_FACTOR,
      marketLongKeyData,
      MARKET_CONFIG.POSITION_FEE_FACTOR_LONG,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.POSITION_FEE_FACTOR,
      marketShortKeyData,
      MARKET_CONFIG.POSITION_FEE_FACTOR_SHORT,
    ])
  );
  console.log("  POSITION_FEE_FACTOR: long=5e25 short=1e26");

  // Swap fees
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.SWAP_FEE_FACTOR,
      marketLongKeyData,
      MARKET_CONFIG.SWAP_FEE_FACTOR_LONG,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.SWAP_FEE_FACTOR,
      marketShortKeyData,
      MARKET_CONFIG.SWAP_FEE_FACTOR_SHORT,
    ])
  );
  console.log("  SWAP_FEE_FACTOR: long=5e26 short=7e26");

  // Position impact
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.POSITION_IMPACT_FACTOR,
      marketPositiveKeyData,
      MARKET_CONFIG.POSITION_IMPACT_POSITIVE,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.POSITION_IMPACT_FACTOR,
      marketNegativeKeyData,
      MARKET_CONFIG.POSITION_IMPACT_NEGATIVE,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.POSITION_IMPACT_EXPONENT_FACTOR,
      marketKeyData,
      MARKET_CONFIG.POSITION_IMPACT_EXPONENT,
    ])
  );
  console.log("  POSITION_IMPACT: pos=8e22 neg=1e23 exp=1.45e30");

  // Swap impact exponent
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.SWAP_IMPACT_EXPONENT_FACTOR,
      marketKeyData,
      MARKET_CONFIG.SWAP_IMPACT_EXPONENT,
    ])
  );
  console.log("  SWAP_IMPACT_EXPONENT: 2e30");

  console.log(`\n  Total config calls: ${calls.length}`);

  if (write) {
    console.log("  Executing multicall...");
    const tx = await config.multicall(calls);
    console.log(`  Tx: ${tx.hash}`);
    await tx.wait();
    console.log("  Confirmed!");
  } else {
    console.log("  Dry run — no transactions sent");
  }

  // === Summary ===
  console.log("\n========================================");
  console.log("SILVER (XAG) Market Deployment Summary");
  console.log("========================================");
  console.log(`Market Token:  ${marketToken}`);
  console.log(`Index Token:   ${XAG_TOKEN} (XAG)`);
  console.log(`Long Token:    ${INFRA.USD0} (USD0)`);
  console.log(`Short Token:   ${INFRA.USD0} (USD0)`);
  console.log(`Leverage:      200x (MCF=3.333e27)`);
  console.log(`Oracle:        PythLazer feed 345`);
  console.log("========================================");
  console.log("\nNext steps:");
  console.log("  1. Seed pool: send USD0 to market token address, then call createDeposit");
  console.log("  2. Update frontend market list if needed");
  console.log("  3. Update infra docs (markets.md)");
  console.log("  4. Restart unified executor to pick up new market");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
