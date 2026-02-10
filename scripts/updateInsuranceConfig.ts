import hre from "hardhat";

import { getMarketKey, getMarketTokenAddresses, getOnchainMarkets } from "../utils/market";

import * as keys from "../utils/keys";
import { bigNumberify, formatAmount } from "../utils/math";

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const multicall = await hre.ethers.getContract("Multicall3");
  const config = await hre.ethers.getContract("Config");

  const { read } = hre.deployments;
  const tokens = await (hre as any).gmx.getTokens();
  const tokensByAddress = Object.fromEntries(
    Object.entries(tokens).map(([symbol, t]) => [(t as any).address, { symbol, ...(t as any) }])
  );
  const markets = await (hre as any).gmx.getMarkets();

  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);
  const multicallReadParams = [];

  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
    const marketKey = getMarketKey(indexToken, longToken, shortToken);
    const onchainMarket = onchainMarketsByTokens[marketKey];
    if (!onchainMarket) {
      console.warn(
        "WARN onchain market with key %s does not exist. index: %s long: %s short: %s",
        marketKey,
        tokensByAddress[indexToken].symbol,
        tokensByAddress[longToken].symbol,
        tokensByAddress[shortToken].symbol
      );
      continue;
    }
    const marketToken = onchainMarket.marketToken;

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [keys.liquidationFeeSplitInsuranceKey(marketToken)]),
    });
    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [keys.insuranceTargetRatioKey(marketToken)]),
    });
  }

  const result = await multicall.callStatic.aggregate3(multicallReadParams);
  const dataCache = [];
  for (let i = 0; i < multicallReadParams.length; i++) {
    const value = bigNumberify(result[i].returnData);
    dataCache.push(value);
  }

  const multicallWriteParams = [];

  for (const [i, marketConfig] of markets.entries()) {
    const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
    const marketKey = getMarketKey(indexToken, longToken, shortToken);
    const onchainMarket = onchainMarketsByTokens[marketKey];
    if (!onchainMarket) {
      continue;
    }
    const marketToken = onchainMarket.marketToken;

    if (
      (marketConfig.liquidationFeeSplitInsurance === undefined && marketConfig.insuranceTargetRatio !== undefined) ||
      (marketConfig.liquidationFeeSplitInsurance !== undefined && marketConfig.insuranceTargetRatio === undefined)
    ) {
      console.warn(
        "WARN: only one of insurance fields is set for market %s liquidationFeeSplitInsurance=%s insuranceTargetRatio=%s",
        marketToken,
        marketConfig.liquidationFeeSplitInsurance,
        marketConfig.insuranceTargetRatio
      );
    }
    if (marketConfig.liquidationFeeSplitInsurance === undefined || marketConfig.insuranceTargetRatio === undefined) {
      continue;
    }

    const currentLiquidationFeeSplitInsurance = dataCache[i * 2];
    const currentInsuranceTargetRatio = dataCache[i * 2 + 1];

    let wasChanged = false;

    if (!currentLiquidationFeeSplitInsurance.eq(marketConfig.liquidationFeeSplitInsurance)) {
      const change = currentLiquidationFeeSplitInsurance.gt(0)
        ? bigNumberify(marketConfig.liquidationFeeSplitInsurance).mul(10000).div(currentLiquidationFeeSplitInsurance)
        : null;
      wasChanged = true;
      console.log(
        "liquidationFeeSplitInsurance was changed for market %s. prev value %s new value %s (%sx)",
        marketToken,
        currentLiquidationFeeSplitInsurance,
        marketConfig.liquidationFeeSplitInsurance,
        change ? formatAmount(change, 4) : "n/a "
      );
    }

    if (!currentInsuranceTargetRatio.eq(marketConfig.insuranceTargetRatio)) {
      const change = currentInsuranceTargetRatio.gt(0)
        ? bigNumberify(marketConfig.insuranceTargetRatio).mul(10000).div(currentInsuranceTargetRatio)
        : null;
      wasChanged = true;
      console.log(
        "insuranceTargetRatio was changed for market %s. prev value %s new value %s (%sx)",
        marketToken,
        currentInsuranceTargetRatio,
        marketConfig.insuranceTargetRatio,
        change ? formatAmount(change, 4) : "n/a "
      );
    }

    if (wasChanged) {
      multicallWriteParams.push(
        config.interface.encodeFunctionData("setInsuranceConfig", [
          marketToken,
          marketConfig.liquidationFeeSplitInsurance,
          marketConfig.insuranceTargetRatio,
        ])
      );
    }
  }

  if (multicallWriteParams.length === 0) {
    console.log("configuration was not changed. skip update");
    return;
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
