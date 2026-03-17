/**
 * Write market config directly to DataStore at the exact prebuilt keys the frontend reads.
 * The Config.setUint uses different key derivation than the prebuild script,
 * so we write directly to match what the frontend expects.
 *
 * Run: npx hardhat run scripts/fix-xag-direct-keys.ts --network baseSepolia
 */
import { ethers } from "hardhat";

const DATA_STORE = "0x0cA7D71845cb485B7593bBdCbcac93d82d52d053";

// Prebuilt keys for market 0x6D260c (from hashedMarketConfigKeys.json)
const KEYS = {
  maxPoolAmount: "0x9eb12c40b0f0e2ffee34a7ccf348b9435ad180077c0d3cb66645015ac2537bb0",
  maxPoolUsdForDeposit: "0xc512046871c686ecc09b4e3251937e23c267d68c67efb74e7cdefc5fd9a8c311",
};

const VALUES = {
  maxPoolAmount: ethers.BigNumber.from("100000000000000"), // 1e14
  maxPoolUsdForDeposit: ethers.BigNumber.from("100000000000000000000000000000000000000"), // 1e38
};

async function main() {
  const dataStore = await ethers.getContractAt("DataStore", DATA_STORE);

  console.log("Current maxPoolAmount:", (await dataStore.getUint(KEYS.maxPoolAmount)).toString());
  console.log("Current maxPoolUsdForDeposit:", (await dataStore.getUint(KEYS.maxPoolUsdForDeposit)).toString());

  console.log("\nSetting maxPoolAmount = 1e14...");
  let tx = await dataStore.setUint(KEYS.maxPoolAmount, VALUES.maxPoolAmount);
  await tx.wait();
  console.log("  Done:", tx.hash);

  console.log("Setting maxPoolUsdForDeposit = 1e38...");
  tx = await dataStore.setUint(KEYS.maxPoolUsdForDeposit, VALUES.maxPoolUsdForDeposit);
  await tx.wait();
  console.log("  Done:", tx.hash);

  console.log("\nVerify maxPoolAmount:", (await dataStore.getUint(KEYS.maxPoolAmount)).toString());
  console.log("Verify maxPoolUsdForDeposit:", (await dataStore.getUint(KEYS.maxPoolUsdForDeposit)).toString());
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
