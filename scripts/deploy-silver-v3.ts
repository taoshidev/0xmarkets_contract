/**
 * Deploy a NEW Silver (XAG) market with correct config from scratch.
 * Uses marketType="silver-v2" to avoid MarketAlreadyExists with the old broken market.
 * All config matches GOLD commodity tier (200x leverage).
 *
 * Run: WRITE=true npx hardhat run scripts/deploy-silver-v3.ts --network baseSepolia
 */
import hre from "hardhat";
const { ethers } = hre;
import * as keys from "../utils/keys";
import { encodeData, hashString, hashData } from "../utils/hash";
import { parseLogs, getEventData } from "../utils/event";

const DATA_STORE = "0x0cA7D71845cb485B7593bBdCbcac93d82d52d053";
const MARKET_FACTORY = "0x60418A0f55d73b086530C9CFDA3cd7bc47a68a66";
const XAG_TOKEN = "0x25f79151C3E00ba7710EcF02192836994E36b440";
const USD0 = "0x3ae4474579d24a743c9016F017e76185A834d837";
const ORACLE_PROVIDER = "0x31060bBaD18D4a13Db2e66eD7b562968e93f1312";
const PYTH_LAZER_TYPE = "0x273d968b62e572a67bccffe361015a831243bf8765d81768b4abee0e83398855";
const MARKET_TYPE = hashString("silver-v2"); // different from old market's bytes32(0)

// GOLD-identical config values
const CFG = {
  MAX_POOL_AMOUNT: ethers.BigNumber.from("100000000000000"), // 1e14
  MAX_POOL_USD_FOR_DEPOSIT: ethers.BigNumber.from("100000000000000000000000000000000000000"), // 1e38
  MCF: ethers.BigNumber.from("3333000000000000000000000000"), // 3.333e27 → 200x
  RESERVE_FACTOR: ethers.BigNumber.from("950000000000000000000000000000"), // 9.5e29
  OI_RESERVE: ethers.BigNumber.from("900000000000000000000000000000"), // 9e29
  MAX_OI: ethers.BigNumber.from("1000000000000000000000000000000000000000"), // 1e39
  FUNDING: ethers.BigNumber.from("1527777777777777777777"), // 1.527e21
  BORROWING: ethers.BigNumber.from("648148148148148148"), // 6.481e17
  POS_FEE_LONG: ethers.BigNumber.from("50000000000000000000000000"), // 5e25
  POS_FEE_SHORT: ethers.BigNumber.from("100000000000000000000000000"), // 1e26
  SWAP_FEE_LONG: ethers.BigNumber.from("500000000000000000000000000"), // 5e26
  SWAP_FEE_SHORT: ethers.BigNumber.from("700000000000000000000000000"), // 7e26
  POS_IMPACT_POS: ethers.BigNumber.from("80000000000000000000000"), // 8e22
  POS_IMPACT_NEG: ethers.BigNumber.from("100000000000000000000000"), // 1e23
  POS_IMPACT_EXP: ethers.BigNumber.from("1450000000000000000000000000000"), // 1.45e30
  SWAP_IMPACT_EXP: ethers.BigNumber.from("2000000000000000000000000000000"), // 2e30
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const write = process.env.WRITE === "true";
  console.log("Deployer:", deployer.address);
  console.log("Mode:", write ? "EXECUTE" : "DRY RUN");

  const dataStore = await ethers.getContractAt("DataStore", DATA_STORE);
  const config = await ethers.getContract("Config");
  const eventEmitter = await ethers.getContract("EventEmitter");
  const marketFactory = await ethers.getContractAt("MarketFactory", MARKET_FACTORY);

  // === 1. Create market ===
  console.log("\n=== Creating XAG/USD market (type: silver-v2) ===");

  let marketToken: string;
  if (write) {
    const tx = await marketFactory.createMarket(XAG_TOKEN, USD0, USD0, MARKET_TYPE, false);
    const receipt = await tx.wait();
    console.log("  tx:", receipt.transactionHash);

    // Parse market address from EventEmitter logs
    const fixture = { contracts: { eventEmitter } };
    const parsed = parseLogs(fixture, receipt);
    const event = getEventData(parsed, "MarketCreated");
    marketToken = event?.marketToken;

    if (!marketToken) {
      // Fallback: read last market from list
      const count = await dataStore.getAddressCount(keys.MARKET_LIST);
      const last = await dataStore.getAddressValuesAt(keys.MARKET_LIST, count.sub(1), count);
      marketToken = last[0];
    }
    console.log("  Market token:", marketToken);
  } else {
    const result = await marketFactory.callStatic.createMarket(XAG_TOKEN, USD0, USD0, MARKET_TYPE, false);
    marketToken = result.marketToken || result;
    console.log("  Would create:", marketToken);
  }

  // === 2. Configure all market params via Config.multicall ===
  console.log("\n=== Configuring market params ===");

  const m = marketToken; // market address
  const calls: string[] = [];

  // Pool limits (keyed by market + token)
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.MAX_POOL_AMOUNT,
      encodeData(["address", "address"], [m, USD0]),
      CFG.MAX_POOL_AMOUNT,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.MAX_POOL_USD_FOR_DEPOSIT,
      encodeData(["address", "address"], [m, USD0]),
      CFG.MAX_POOL_USD_FOR_DEPOSIT,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.MAX_POOL_USD_FOR_DEPOSIT,
      encodeData(["address", "address"], [m, XAG_TOKEN]),
      CFG.MAX_POOL_USD_FOR_DEPOSIT,
    ])
  );
  console.log("  Pool limits: MAX_POOL=1e14, MAX_USD_DEPOSIT=1e38");

  // Leverage (keyed by market)
  calls.push(
    config.interface.encodeFunctionData("setUint", [keys.MIN_COLLATERAL_FACTOR, encodeData(["address"], [m]), CFG.MCF])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.MIN_MAINTAIN_COLLATERAL_FACTOR,
      encodeData(["address"], [m]),
      CFG.MCF,
    ])
  );
  console.log("  Leverage: 200x (MCF=3.333e27)");

  // Reserve factors (keyed by market + isLong)
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.RESERVE_FACTOR,
      encodeData(["address", "bool"], [m, true]),
      CFG.RESERVE_FACTOR,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.RESERVE_FACTOR,
      encodeData(["address", "bool"], [m, false]),
      CFG.RESERVE_FACTOR,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.OPEN_INTEREST_RESERVE_FACTOR,
      encodeData(["address", "bool"], [m, true]),
      CFG.OI_RESERVE,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.OPEN_INTEREST_RESERVE_FACTOR,
      encodeData(["address", "bool"], [m, false]),
      CFG.OI_RESERVE,
    ])
  );
  console.log("  Reserve: 9.5e29 | OI Reserve: 9e29");

  // Open interest caps
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.MAX_OPEN_INTEREST,
      encodeData(["address", "bool"], [m, true]),
      CFG.MAX_OI,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.MAX_OPEN_INTEREST,
      encodeData(["address", "bool"], [m, false]),
      CFG.MAX_OI,
    ])
  );
  console.log("  Max OI: 1e39");

  // Funding & borrowing
  calls.push(
    config.interface.encodeFunctionData("setUint", [keys.FUNDING_FACTOR, encodeData(["address"], [m]), CFG.FUNDING])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.BORROWING_FACTOR,
      encodeData(["address", "bool"], [m, true]),
      CFG.BORROWING,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.BORROWING_FACTOR,
      encodeData(["address", "bool"], [m, false]),
      CFG.BORROWING,
    ])
  );
  console.log("  Funding: 1.527e21 | Borrowing: 6.481e17");

  // Position fees
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.POSITION_FEE_FACTOR,
      encodeData(["address", "bool"], [m, true]),
      CFG.POS_FEE_LONG,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.POSITION_FEE_FACTOR,
      encodeData(["address", "bool"], [m, false]),
      CFG.POS_FEE_SHORT,
    ])
  );
  console.log("  Pos fees: long=5e25 short=1e26");

  // Swap fees
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.SWAP_FEE_FACTOR,
      encodeData(["address", "bool"], [m, true]),
      CFG.SWAP_FEE_LONG,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.SWAP_FEE_FACTOR,
      encodeData(["address", "bool"], [m, false]),
      CFG.SWAP_FEE_SHORT,
    ])
  );
  console.log("  Swap fees: long=5e26 short=7e26");

  // Impact
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.POSITION_IMPACT_FACTOR,
      encodeData(["address", "bool"], [m, true]),
      CFG.POS_IMPACT_POS,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.POSITION_IMPACT_FACTOR,
      encodeData(["address", "bool"], [m, false]),
      CFG.POS_IMPACT_NEG,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.POSITION_IMPACT_EXPONENT_FACTOR,
      encodeData(["address"], [m]),
      CFG.POS_IMPACT_EXP,
    ])
  );
  calls.push(
    config.interface.encodeFunctionData("setUint", [
      keys.SWAP_IMPACT_EXPONENT_FACTOR,
      encodeData(["address"], [m]),
      CFG.SWAP_IMPACT_EXP,
    ])
  );
  console.log("  Impact: pos=8e22 neg=1e23 exp=1.45e30 | swap_exp=2e30");

  console.log(`\n  Total calls: ${calls.length}`);

  if (write) {
    const tx = await config.multicall(calls);
    console.log("  Config tx:", tx.hash);
    await tx.wait();
    console.log("  Confirmed!");
  } else {
    console.log("  Dry run — skipped");
  }

  // === 3. Disable old market ===
  if (write) {
    console.log("\n=== Disabling old XAG market ===");
    const OLD_MARKET = "0xF95b646d40bb4bc5e1B7a60c3D79Ff5aa41bF967";
    const disableTx = await config.setBool(keys.IS_MARKET_DISABLED, encodeData(["address"], [OLD_MARKET]), true);
    await disableTx.wait();
    console.log("  Old market disabled:", OLD_MARKET);
  }

  // === Summary ===
  console.log("\n========================================");
  console.log("  NEW SILVER (XAG) Market Deployed");
  console.log("========================================");
  console.log(`  Market Token: ${marketToken}`);
  console.log(`  Index Token:  ${XAG_TOKEN}`);
  console.log(`  Collateral:   ${USD0} (USD0)`);
  console.log(`  Leverage:     200x`);
  console.log(`  Oracle:       PythLazer feed 345`);
  console.log("========================================");
  console.log("\nNext steps:");
  console.log("  1. Run `npm run prebuild` in the frontend to generate hashed keys");
  console.log("  2. Seed pool with USD0 deposit");
  console.log("  3. Restart unified executor");
  console.log("  4. Update infra docs");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
