/**
 * Fix ORACLE_PROVIDER_FOR_TOKEN for USD0, WETH, and XAG.
 * These three tokens still point to the old PythLazerFeedProvider (0xc5810F)
 * which uses an outdated DataStore (0xBaD04). They need to use the new provider
 * (0x31060b) which uses the current DataStore (0x0cA7D).
 *
 * Run: npx hardhat run scripts/fix-oracle-providers.ts --network baseSepolia
 */
import { ethers } from "hardhat";

const DATA_STORE = "0x0cA7D71845cb485B7593bBdCbcac93d82d52d053";
const NEW_PROVIDER = "0x31060bBaD18D4a13Db2e66eD7b562968e93f1312";

const TOKENS_TO_FIX = [
  { name: "USD0", address: "0x3ae4474579d24a743c9016F017e76185A834d837" },
  { name: "WETH", address: "0x4200000000000000000000000000000000000006" },
  { name: "XAG", address: "0x25f79151C3E00ba7710EcF02192836994E36b440" },
];

function hashString(str: string) {
  return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], [str]));
}

function hashData(types: string[], values: any[]) {
  return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(types, values));
}

const ORACLE_PROVIDER_FOR_TOKEN = hashString("ORACLE_PROVIDER_FOR_TOKEN");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const dataStore = await ethers.getContractAt(
    ["function setAddress(bytes32,address) external", "function getAddress(bytes32) view returns (address)"],
    DATA_STORE
  );

  for (const token of TOKENS_TO_FIX) {
    const key = hashData(["bytes32", "address"], [ORACLE_PROVIDER_FOR_TOKEN, token.address]);
    const current = await dataStore.getAddress(key);
    console.log(`\n${token.name} (${token.address})`);
    console.log(`  Current provider: ${current}`);

    if (current.toLowerCase() === NEW_PROVIDER.toLowerCase()) {
      console.log(`  Already correct — skipping`);
      continue;
    }

    console.log(`  Updating to: ${NEW_PROVIDER}`);
    const tx = await dataStore.setAddress(key, NEW_PROVIDER);
    await tx.wait();
    console.log(`  Done: ${tx.hash}`);

    // Verify
    const updated = await dataStore.getAddress(key);
    console.log(`  Verified: ${updated}`);
  }

  console.log("\nAll oracle providers updated.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
