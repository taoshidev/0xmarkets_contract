/**
 * Fix missing PnL factor config for XAG v2 market (0x6D260c).
 * Writes directly to DataStore 0x0cA7D71 (the one used by contracts/keepers).
 *
 * NOTE: The Config contract points to a DIFFERENT DataStore (0x3B9d71B),
 * so we cannot use Config.setUint — we must write directly.
 *
 * Key: keccak256(abi.encode(MAX_PNL_FACTOR, pnlFactorType, market, isLong))
 *
 * Run: npx hardhat run scripts/fix-xag-pnl-factors.ts --network baseSepolia
 */
import hre from "hardhat";
const { ethers } = hre;

const DATA_STORE = "0x0cA7D71845cb485B7593bBdCbcac93d82d52d053";
const MARKET = "0x6D260c4229dBb55a0a91041b5c07b320fdD6303B";

// Hash helpers matching Solidity Keys.sol
function hashString(s: string): string {
  return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], [s]));
}

function pnlFactorKey(pnlFactorType: string, market: string, isLong: boolean): string {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "bytes32", "address", "bool"],
      [hashString("MAX_PNL_FACTOR"), pnlFactorType, market, isLong]
    )
  );
}

function minPnlFactorAfterAdlKey(market: string, isLong: boolean): string {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "address", "bool"],
      [hashString("MIN_PNL_FACTOR_AFTER_ADL"), market, isLong]
    )
  );
}

// commodityMarketOverrides values
const FACTORS = [
  {
    name: "maxPnlFactorForTraders",
    type: hashString("MAX_PNL_FACTOR_FOR_TRADERS"),
    value: "700000000000000000000000000000",
  },
  { name: "maxPnlFactorForAdl", type: hashString("MAX_PNL_FACTOR_FOR_ADL"), value: "650000000000000000000000000000" },
  {
    name: "maxPnlFactorForDeposits",
    type: hashString("MAX_PNL_FACTOR_FOR_DEPOSITS"),
    value: "700000000000000000000000000000",
  },
  {
    name: "maxPnlFactorForWithdrawals",
    type: hashString("MAX_PNL_FACTOR_FOR_WITHDRAWALS"),
    value: "550000000000000000000000000000",
  },
];

async function main() {
  const dataStore = await ethers.getContractAt("DataStore", DATA_STORE);

  // Set MAX_PNL_FACTOR keys
  for (const { name, type, value } of FACTORS) {
    for (const isLong of [true, false]) {
      const key = pnlFactorKey(type, MARKET, isLong);
      const current = await dataStore.getUint(key);
      const target = ethers.BigNumber.from(value);

      if (current.eq(target)) {
        console.log(`  ${name} (${isLong ? "long" : "short"}): already correct`);
        continue;
      }

      const tx = await dataStore.setUint(key, target);
      await tx.wait();
      console.log(
        `  ${name} (${isLong ? "long" : "short"}): set → ${value.substring(0, 15)}... (${tx.hash.substring(0, 18)}...)`
      );
    }
  }

  // Set MIN_PNL_FACTOR_AFTER_ADL
  for (const isLong of [true, false]) {
    const key = minPnlFactorAfterAdlKey(MARKET, isLong);
    const value = ethers.BigNumber.from("600000000000000000000000000000");
    const current = await dataStore.getUint(key);

    if (current.eq(value)) {
      console.log(`  minPnlFactorAfterAdl (${isLong ? "long" : "short"}): already correct`);
      continue;
    }

    const tx = await dataStore.setUint(key, value);
    await tx.wait();
    console.log(`  minPnlFactorAfterAdl (${isLong ? "long" : "short"}): set → 6e29 (${tx.hash.substring(0, 18)}...)`);
  }

  // Verify
  const verifyKey = pnlFactorKey(hashString("MAX_PNL_FACTOR_FOR_DEPOSITS"), MARKET, true);
  const val = await dataStore.getUint(verifyKey);
  console.log(`\nVerify maxPnlFactorForDeposits (long): ${val.toString()}`);
  console.log("Deposits should now work for the XAG market.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
