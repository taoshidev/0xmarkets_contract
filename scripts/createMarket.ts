import hre from "hardhat";
import prompts from "prompts";
import { getEventData, parseLogs } from "../utils/event";
import { encodeData } from "../utils/hash";
import * as keys from "../utils/keys";
import { createMarketConfigByKey, getMarketKey, getMarketTokenAddresses } from "../utils/market";

let write = process.env.WRITE === "true";

async function main() {
  const marketFactory = await hre.ethers.getContract("MarketFactory");
  const config = await hre.ethers.getContract("Config");
  const dataStore = await hre.ethers.getContract("DataStore");
  const eventEmitter = await hre.ethers.getContract("EventEmitter");
  const tokens = await hre.gmx.getTokens();

  // marketKey should be of the form indexToken:longToken:shortToken:normal or reversed
  const marketKey = process.env.MARKET_KEY;

  if (!marketKey) {
    throw new Error("MARKET_KEY is empty");
  }

  const tokenSymbols = marketKey.split(":");

  const indexTokenSymbol = tokenSymbols[0];
  const longTokenSymbol = tokenSymbols[1];
  const shortTokenSymbol = tokenSymbols[2];
  const reversed = tokenSymbols[3] == "reversed" ? true : false;

  const [indexTokenAddress, longTokenAddress, shortTokenAddress] = getMarketTokenAddresses(
    {
      tokens: {
        indexToken: indexTokenSymbol,
        longToken: longTokenSymbol,
        shortToken: shortTokenSymbol,
      },
    },
    tokens
  );

  const marketConfigs = await hre.gmx.getMarkets();
  const marketConfigKey = getMarketKey(indexTokenAddress, longTokenAddress, shortTokenAddress, reversed);
  const marketConfigByKey = createMarketConfigByKey({ marketConfigs, tokens });
  const marketConfig = marketConfigByKey[marketConfigKey];

  if (!marketConfig) {
    throw new Error("Empty market config");
  }

  console.info(
    `creating market: indexToken: ${indexTokenAddress}, longToken: ${longTokenAddress}, shortToken: ${shortTokenAddress}, reversed: ${reversed}`
  );

  if (!write) {
    ({ write } = await prompts({
      type: "confirm",
      name: "write",
      message: "Do you want to execute the transactions?",
    }));
  }

  if (write) {
    const tx0 = await marketFactory.createMarket(indexTokenAddress, longTokenAddress, shortTokenAddress, reversed);
    console.log(`create market tx sent: ${tx0.hash}`);

    const receipt = await hre.ethers.provider.getTransactionReceipt(tx0.hash);
    if (!receipt) {
      throw new Error("Transaction not found");
    }

    const fixture = { contracts: { eventEmitter } };
    const parsedLogs = parseLogs(fixture, receipt);
    const marketCreatedEvent = getEventData(parsedLogs, "MarketCreated");

    const { marketToken } = marketCreatedEvent;

    console.log(`market created: ${marketToken}`);

    if (marketConfig.virtualMarketId) {
      console.log(`setting virtualMarketId: ${marketConfig.virtualMarketId}`);
      const tx1 = await config.setBytes32(
        keys.VIRTUAL_MARKET_ID,
        encodeData(["address"], [marketToken]),
        marketConfig.virtualMarketId
      );
      console.log(`set virtualMarketId tx sent: ${tx1.hash}`);
    }

    const virtualTokenId = marketConfig.virtualTokenIdForIndexToken;
    if (virtualTokenId) {
      const existingVirtualTokenIdForIndexToken = await dataStore.getBytes32(keys.virtualTokenIdKey(indexTokenAddress));
      console.log(`existingVirtualTokenIdForIndexToken: ${existingVirtualTokenIdForIndexToken}`);

      if (existingVirtualTokenIdForIndexToken.toLowerCase() === virtualTokenId.toLowerCase()) {
        console.log("skipping setting of virtualTokenId as it already set");
      } else {
        if (existingVirtualTokenIdForIndexToken === ethers.constants.HashZero) {
          console.log(`setting virtualTokenId: ${virtualTokenId}`);
          const tx2 = await config.setBytes32(
            keys.VIRTUAL_TOKEN_ID,
            encodeData(["address"], [marketToken]),
            marketConfig.virtualTokenIdForIndexToken
          );
          console.log(`set virtualTokenId tx sent: ${tx2.hash}`);
        } else {
          console.warn(
            "WARNING: virtualTokenId is already set for this index token but is different from configuration for this market"
          );
        }
      }
    }
  } else {
    const { marketToken } = await marketFactory.callStatic.createMarket(
      indexTokenAddress,
      longTokenAddress,
      shortTokenAddress,
      reversed
    );

    console.log("NOTE: executed in read-only mode, no transactions were sent, marketToken would be %s", marketToken);
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
