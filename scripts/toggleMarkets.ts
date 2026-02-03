import hre from "hardhat";

import { encodeData } from "../utils/hash";
import { getMarketKey, getMarketName, getMarketTokenAddresses, getOnchainMarkets } from "../utils/market";
import * as keys from "../utils/keys";

async function toggleMarket({ config, multicallWriteParams, marketToken, marketName, isDisabled }) {
  if (isDisabled) {
    console.log(`    disabling ${marketName} [${marketToken}]`);
  } else {
    console.log(`    enabling ${marketName} [${marketToken}]`);
  }

  multicallWriteParams.push(
    config.interface.encodeFunctionData("setBool", [
      keys.IS_MARKET_DISABLED,
      encodeData(["address"], [marketToken]),
      isDisabled,
    ])
  );
}

export async function main() {
  const { read } = hre.deployments;

  const tokens = await hre.gmx.getTokens();
  const markets = await hre.gmx.getMarkets();

  const dataStore = await hre.ethers.getContract("DataStore");
  const config = await hre.ethers.getContract("Config");

  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  const multicallWriteParams = [];

  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
    const marketKey = getMarketKey(indexToken, longToken, shortToken, marketConfig.reversed);
    const onchainMarket = onchainMarketsByTokens[marketKey];
    const marketToken = onchainMarket.marketToken;

    const marketName = getMarketName(marketConfig);
    console.log(`checking ${marketName} [${marketToken}]`);

    const toggleMarketParams = { config, multicallWriteParams, marketToken, marketName };

    if (process.env.ENABLE_ALL) {
      if (marketConfig.isDisabled) {
        console.warn(`    WARNING: ${marketName} [${marketToken}] has isDisabled set to true, skipping market`);
        continue;
      }

      await toggleMarket({ ...toggleMarketParams, isDisabled: false });
      continue;
    }

    if (process.env.DISABLE_ALL) {
      console.log(`disabling ${marketName} [${marketToken}]`);
      await toggleMarket({ ...toggleMarketParams, isDisabled: true });
      continue;
    }

    if (marketConfig.isDisabled === undefined) {
      continue;
    }

    await toggleMarket({ ...toggleMarketParams, isDisabled: marketConfig.isDisabled });
  }

  console.log(`updating ${multicallWriteParams.length} params`);
  console.log("multicallWriteParams", multicallWriteParams);

  if (process.env.WRITE === "true") {
    const tx = await config.multicall(multicallWriteParams);
    await tx.wait(1);
    await new Promise((r) => setTimeout(r, 2000));
    console.log(`tx sent: ${tx.hash}`);
  } else {
    console.log("NOTE: executed in read-only mode, no transactions were sent");
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
