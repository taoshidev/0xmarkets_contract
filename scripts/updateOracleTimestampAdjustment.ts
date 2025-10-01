import hre from "hardhat";

import * as keys from "../utils/keys";

import { setUintIfDifferent } from "../utils/dataStore";

async function main() {
  if (hre.network.name !== "avalancheFuji") {
    throw new Error("Unsupported network");
  }

  const tokens = await hre.gmx.getTokens();

  const ChainlinkAdapter = await hre.ethers.getContract("ChainlinkAdapter");
  const PythAdapter = await hre.ethers.getContract("PythAdapter");

  await setUintIfDifferent(
    keys.oracleTimestampAdjustmentKey(ChainlinkAdapter.address, tokens.USDC.address),
    2,
    "chainlink data stream provider"
  );
  await setUintIfDifferent(
    keys.oracleTimestampAdjustmentKey(PythAdapter.address, tokens.USDC.address),
    3,
    "chainlink price feed provider"
  );
  await setUintIfDifferent(
    keys.oracleTimestampAdjustmentKey(ChainlinkAdapter.address, tokens.USDC.address),
    10,
    "chainlink data stream provider"
  );
  console.log("done");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
