import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TokenConfig } from "../config/tokens";
import { setBoolIfDifferent, setUintIfDifferent } from "../utils/dataStore";
import * as keys from "../utils/keys";
import { expandDecimals } from "../utils/math";

const func = async ({ gmx }: HardhatRuntimeEnvironment) => {
  const { getTokens } = gmx;
  const tokens: Record<string, TokenConfig> = await getTokens();

  for (const [tokenSymbol, token] of Object.entries(tokens)) {
    if (!token.pythLazerFeedId) {
      continue;
    }

    if (!token.address) {
      throw new Error(`token ${tokenSymbol} has no address`);
    }

    if (!token.decimals) {
      throw new Error(`token ${tokenSymbol} has no decimals`);
    }

    if (!token.pythLazerFeedDecimals) {
      throw new Error(`token ${tokenSymbol} has no pythLazerFeedDecimals`);
    }

    await setUintIfDifferent(
      keys.pythLazerFeedIdKey(token.address),
      token.pythLazerFeedId,
      `Pyth Lazer feed id for ${tokenSymbol} ${token.address}`
    );

    if (token.pythLazerFeedInverted) {
      await setBoolIfDifferent(
        keys.pythLazerFeedInvertedKey(token.address),
        token.pythLazerFeedInverted,
        `Pyth Lazer feed inverted flag for ${tokenSymbol} ${token.address}`
      );
    }

    await setUintIfDifferent(
      keys.pythLazerFeedMultiplierKey(token.address),
      expandDecimals(1, 60 - token.decimals - token.pythLazerFeedDecimals),
      `Pyth Lazer feed multiplier for ${tokenSymbol} ${token.address}`
    );
  }
};

func.dependencies = ["Tokens"];
func.tags = ["PythLazerFeedProvider"];

export default func;
