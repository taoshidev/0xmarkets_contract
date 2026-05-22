import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as keys from "../utils/keys";
import { setBoolIfDifferent, setBytes32IfDifferent, setUintIfDifferent } from "../utils/dataStore";
import {
  DEFAULT_MARKET_TYPE,
  getMarketTokenAddresses,
  getMarketKey,
  getMarketName,
  getOnchainMarkets,
} from "../utils/market";
import { updateMarketConfig } from "../scripts/updateMarketConfigUtils";

const func = async ({ deployments, getNamedAccounts, ethers, gmx }: HardhatRuntimeEnvironment) => {
  const { execute, get, read, log } = deployments;

  if (process.env.SKIP_NEW_MARKETS) {
    log("WARN: new markets will be skipped");
  }

  const { deployer } = await getNamedAccounts();

  const tokens = await gmx.getTokens();
  const markets = await gmx.getMarkets();

  const dataStore = await get("DataStore");

  let onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);

    const marketKey = getMarketKey(indexToken, longToken, shortToken, marketConfig.reversed);
    const marketName = getMarketName(marketConfig);
    const onchainMarket = onchainMarketsByTokens[marketKey];
    if (onchainMarket) {
      log("market %s already exists at %s", marketName, onchainMarket.marketToken);
      continue;
    }

    if (process.env.SKIP_NEW_MARKETS) {
      log("WARN: new market %s skipped", marketName);
      continue;
    }

    const marketType = DEFAULT_MARKET_TYPE;
    log("creating market %s", marketName);
    const receipt = await execute(
      "MarketFactory",
      { from: deployer, log: true },
      "createMarket",
      indexToken,
      longToken,
      shortToken,
      marketType,
      marketConfig.reversed
    );
    if (receipt.transactionHash) {
      const tx = await ethers.provider.getTransaction(receipt.transactionHash);
      if (tx) {
        await tx.wait(1);
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
    const marketKey = getMarketKey(indexToken, longToken, shortToken, marketConfig.reversed);
    const onchainMarket = onchainMarketsByTokens[marketKey];
    const marketToken = onchainMarket.marketToken;

    // if trades are done before virtual IDs are set, the tracking of virtual
    // inventories may not be accurate
    //
    // so virtual IDs should be set before other market configurations e.g.
    // max pool amounts, this would help to ensure that no trades can be done
    // before virtual IDs are set

    // set virtual market id for swaps
    const virtualMarketId = marketConfig.virtualMarketId;
    if (virtualMarketId) {
      await setBytes32IfDifferent(
        keys.virtualMarketIdKey(marketToken),
        virtualMarketId,
        `virtual market id for market ${marketToken.toString()}`
      );
    }

    // set virtual token id for perps
    const virtualTokenId = marketConfig.virtualTokenIdForIndexToken;
    if (virtualTokenId) {
      await setBytes32IfDifferent(
        keys.virtualTokenIdKey(indexToken),
        virtualTokenId,
        `virtual token id for indexToken ${indexToken.toString()}`
      );
    }

    if (marketConfig.isDisabled !== undefined) {
      const key = keys.isMarketDisabledKey(marketToken);
      await setBoolIfDifferent(key, marketConfig.isDisabled, `isDisabled for ${marketToken}`);
    }

    // the rest of the params are not used for swap-only markets
    if (marketConfig.swapOnly !== undefined) {
      continue;
    }

    for (const name of ["positionImpactPoolDistributionRate", "minPositionImpactPoolAmount"]) {
      if (marketConfig[name]) {
        const value = marketConfig[name];
        const key = keys[`${name}Key`](marketToken);
        await setUintIfDifferent(key, value, `${name} for ${marketToken.toString()}`);
      }
    }
  }

  const write = process.env.FOR_EXISTING_MAINNET_DEPLOYMENT ? false : true;
  if (write) {
    await updateMarketConfig({ write: true });
  }

  // Push leverage ladders per market via Config.setLeverageLadder.
  // Runs after updateMarketConfig so max_leverage / min_leverage are in place
  // for the setter's band check. Idempotent: skip if the on-chain ladder
  // already matches the config exactly (same length + identical tier values).
  // Refresh the on-chain market index before pushing — markets created earlier
  // in this run won't appear in the snapshot taken at the top of the function.
  onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  for (const marketConfig of markets) {
    if (marketConfig.swapOnly || marketConfig.leverageLadder === undefined) {
      continue;
    }

    const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
    const marketKey = getMarketKey(indexToken, longToken, shortToken, marketConfig.reversed);
    const onchainMarket = onchainMarketsByTokens[marketKey];
    if (!onchainMarket) {
      continue;
    }
    const marketToken = onchainMarket.marketToken;

    const tiers = marketConfig.leverageLadder;
    const onchainCount = (await read("DataStore", "getUint", keys.leverageLadderTierCountKey(marketToken))).toNumber();

    let needsUpdate = onchainCount !== tiers.length;
    if (!needsUpdate) {
      for (let i = 0; i < tiers.length; i++) {
        const onchainNotional = await read("DataStore", "getUint", keys.leverageLadderMaxNotionalKey(marketToken, i));
        const onchainLev = await read("DataStore", "getUint", keys.leverageLadderMaxLeverageKey(marketToken, i));
        if (!onchainNotional.eq(tiers[i].maxNotionalUsd) || !onchainLev.eq(tiers[i].maxLeverage)) {
          needsUpdate = true;
          break;
        }
      }
    }

    if (needsUpdate) {
      log("setting leverage ladder for market %s (%d tiers)", marketToken, tiers.length);
      await execute(
        "Config",
        { from: deployer, log: true },
        "setLeverageLadder",
        marketToken,
        tiers.map((t) => t.maxNotionalUsd),
        tiers.map((t) => t.maxLeverage)
      );
      // Same pending-nonce race as utils/role.ts — give the RPC's mempool
      // view time to advance before the next setLeverageLadder.
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
};

func.skip = async ({ gmx, network }) => {
  // skip if no markets configured
  const markets = await gmx.getMarkets();
  if (!markets || markets.length === 0) {
    console.warn("no markets configured for network %s", network.name);
    return true;
  }
  return false;
};
func.runAtTheEnd = true;
func.tags = ["Markets"];
func.dependencies = ["Assets", "MarketFactory", "Tokens", "DataStore", "Config", "Multicall", "Roles"];
export default func;
