/**
 * Set MAX_POOL_USD_FOR_DEPOSIT for XAG market (both long and short sides).
 * Without this, the frontend caps deposit capacity at 0.
 *
 * Run: WRITE=true npx hardhat run scripts/fix-xag-pool-usd-deposit.ts --network baseSepolia
 */
import hre from "hardhat";
const { ethers } = hre;
import * as keys from "../utils/keys";
import { encodeData } from "../utils/hash";

const XAG_MARKET = "0xF95b646d40bb4bc5e1B7a60c3D79Ff5aa41bF967";
const XAG_TOKEN = "0x25f79151C3E00ba7710EcF02192836994E36b440";
const USD0 = "0x3ae4474579d24a743c9016F017e76185A834d837";
const VALUE = ethers.BigNumber.from("100000000000000000000000000000000000000"); // 1e38

async function main() {
  const config = await ethers.getContract("Config");
  const dataStore = await ethers.getContract("DataStore");

  // maxPoolUsdForDepositKey is keyed by (market, token), not (market, isLong)
  const currentXag = await dataStore.getUint(keys.maxPoolUsdForDepositKey(XAG_MARKET, XAG_TOKEN));
  const currentUsd0 = await dataStore.getUint(keys.maxPoolUsdForDepositKey(XAG_MARKET, USD0));
  console.log("Current MAX_POOL_USD_FOR_DEPOSIT XAG:", currentXag.toString());
  console.log("Current MAX_POOL_USD_FOR_DEPOSIT USD0:", currentUsd0.toString());
  console.log("Target:", VALUE.toString());

  if (process.env.WRITE !== "true") {
    console.log("\nDry run. Set WRITE=true to execute.");
    return;
  }

  const xagKeyData = encodeData(["address", "address"], [XAG_MARKET, XAG_TOKEN]);
  const usd0KeyData = encodeData(["address", "address"], [XAG_MARKET, USD0]);

  const calls = [
    config.interface.encodeFunctionData("setUint", [keys.MAX_POOL_USD_FOR_DEPOSIT, xagKeyData, VALUE]),
    config.interface.encodeFunctionData("setUint", [keys.MAX_POOL_USD_FOR_DEPOSIT, usd0KeyData, VALUE]),
  ];

  console.log("\nExecuting...");
  const tx = await config.multicall(calls);
  console.log("tx:", tx.hash);
  await tx.wait();
  console.log("Confirmed!");

  // Verify
  const newXag = await dataStore.getUint(keys.maxPoolUsdForDepositKey(XAG_MARKET, XAG_TOKEN));
  const newUsd0 = await dataStore.getUint(keys.maxPoolUsdForDepositKey(XAG_MARKET, USD0));
  console.log("\nVerified XAG:", newXag.toString());
  console.log("Verified USD0:", newUsd0.toString());
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
