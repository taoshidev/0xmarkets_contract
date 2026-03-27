/**
 * Configure TAO oracle: set oracle type, provider, feed ID, and multiplier.
 * Run: npx hardhat run scripts/configure-tao-oracle.ts --network baseSepolia
 */
import { ethers } from "hardhat";

const DATA_STORE = "0xBaD049d5FedE7Bd9022F7E750B982349fE17e83E";
const TAO_TOKEN = "0x8E235a31AB3bb754DA40d05e4E5787b67c8BeDcd";
const ORACLE_PROVIDER = "0xc5810FC1932e44866bD0D041FbfB08d8AC2A67d6"; // Same as all other tokens

function hashString(str: string) {
  return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], [str]));
}
function hashData(types: string[], values: any[]) {
  return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(types, values));
}

const ORACLE_TYPE = hashString("ORACLE_TYPE");
const ORACLE_PROVIDER_FOR_TOKEN = hashString("ORACLE_PROVIDER_FOR_TOKEN");
const PYTH_LAZER_FEED_ID = hashString("PYTH_LAZER_FEED_ID");
const PYTH_LAZER_FEED_MULTIPLIER = hashString("PYTH_LAZER_FEED_MULTIPLIER");

const taoOracleTypeKey = hashData(["bytes32", "address"], [ORACLE_TYPE, TAO_TOKEN]);
const taoProviderKey = hashData(["bytes32", "address"], [ORACLE_PROVIDER_FOR_TOKEN, TAO_TOKEN]);
const taoFeedIdKey = hashData(["bytes32", "address"], [PYTH_LAZER_FEED_ID, TAO_TOKEN]);
const taoFeedMultiplierKey = hashData(["bytes32", "address"], [PYTH_LAZER_FEED_MULTIPLIER, TAO_TOKEN]);

// TAO: feed 36, 8 feed decimals, 18 token decimals → multiplier = 10^(60-18-8) = 10^34
const TAO_FEED_ID = 36;
const TAO_FEED_MULTIPLIER = ethers.BigNumber.from(10).pow(34);
const PYTH_LAZER_TYPE = "0x273d968b62e572a67bccffe361015a831243bf8765d81768b4abee0e83398855";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const dataStore = await ethers.getContractAt(
    [
      "function setAddress(bytes32,address) external",
      "function setBytes32(bytes32,bytes32) external",
      "function setInt(bytes32,int256) external",
      "function setUint(bytes32,uint256) external",
      "function getAddress(bytes32) view returns (address)",
      "function getBytes32(bytes32) view returns (bytes32)",
      "function getInt(bytes32) view returns (int256)",
      "function getUint(bytes32) view returns (uint256)",
    ],
    DATA_STORE
  );

  // Read current
  console.log("\n--- Current TAO Config ---");
  console.log("Oracle type:    ", await dataStore.getBytes32(taoOracleTypeKey));
  console.log("Oracle provider:", await dataStore.getAddress(taoProviderKey));
  console.log("Feed ID:        ", (await dataStore.getInt(taoFeedIdKey)).toString());
  console.log("Feed multiplier:", (await dataStore.getUint(taoFeedMultiplierKey)).toString());

  // Set oracle type
  console.log("\nSetting oracle type...");
  let tx = await dataStore.setBytes32(taoOracleTypeKey, PYTH_LAZER_TYPE);
  await tx.wait();
  console.log("  Done:", tx.hash);
  await new Promise((r) => setTimeout(r, 3000));

  // Set oracle provider
  console.log("Setting oracle provider...");
  tx = await dataStore.setAddress(taoProviderKey, ORACLE_PROVIDER);
  await tx.wait();
  console.log("  Done:", tx.hash);
  await new Promise((r) => setTimeout(r, 3000));

  // Set feed ID (must use setUint — PythLazerFeedProvider reads getUint)
  console.log("Setting feed ID...");
  tx = await dataStore.setUint(taoFeedIdKey, TAO_FEED_ID);
  await tx.wait();
  console.log("  Done:", tx.hash);
  await new Promise((r) => setTimeout(r, 3000));

  // Set feed multiplier
  console.log("Setting feed multiplier...");
  tx = await dataStore.setUint(taoFeedMultiplierKey, TAO_FEED_MULTIPLIER);
  await tx.wait();
  console.log("  Done:", tx.hash);

  // Verify
  console.log("\n--- Updated TAO Config ---");
  console.log("Oracle type:    ", await dataStore.getBytes32(taoOracleTypeKey));
  console.log("Oracle provider:", await dataStore.getAddress(taoProviderKey));
  console.log("Feed ID:        ", (await dataStore.getInt(taoFeedIdKey)).toString());
  console.log("Feed multiplier:", (await dataStore.getUint(taoFeedMultiplierKey)).toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
