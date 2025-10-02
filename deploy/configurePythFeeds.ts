import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TokenConfig } from "../config/tokens";

import * as keys from "../utils/keys";
import { setUintIfDifferent } from "../utils/dataStore";

const func = async ({ gmx }: HardhatRuntimeEnvironment) => {
  const { getTokens } = gmx;
  const tokens: Record<string, TokenConfig> = await getTokens();

  for (const [tokenSymbol, token] of Object.entries(tokens)) {
    if (!token.pythFeedId) {
      continue;
    }

    if (!token.address) {
      throw new Error(`token ${tokenSymbol} has no address`);
    }

    await setUintIfDifferent(
      keys.pythFeedIdKey(token.address),
      token.pythFeedId,
      `pyth feed id for ${tokenSymbol} ${token.address}`
    );
  }
};

func.tags = ["PythFeeds"];
func.dependencies = ["Tokens"];
export default func;
