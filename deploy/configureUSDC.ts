import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as keys from "../utils/keys";
import { setAddressIfDifferent } from "../utils/dataStore";

const func = async ({ gmx, deployments }: HardhatRuntimeEnvironment) => {
  const log = deployments.log;
  const tokens = await gmx.getTokens();

  // Prefer canonical USDC, then USDC.e; fallback left unset if missing
  const usdc = tokens.USDC?.address || tokens["USDC.e"]?.address;

  if (!usdc) {
    log("WARN: No USDC token configured for this network; skipping USDC address set");
    return;
  }

  await setAddressIfDifferent(keys.USDC, usdc, "USDC token address");
};

func.tags = ["USDCConfig"];
func.dependencies = ["DataStore", "Config", "Multicall", "Roles", "Tokens"];
export default func;

