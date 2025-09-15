import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TokenConfig } from "../config/tokens";

import * as keys from "../utils/keys";
import { setAddressIfDifferent, setUintIfDifferent } from "../utils/dataStore";
import { expandDecimals } from "../utils/math";

const func = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, gmx, network, ethers } = hre as any;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const { getTokens } = gmx;
  const tokens = (await getTokens()) as Record<string, TokenConfig>;

  for (const [tokenSymbol, token] of Object.entries(tokens)) {
    const isSynthetic = (token as any).synthetic as boolean | undefined;
    const shouldDeploy = (token as any).deploy as boolean | undefined;
    if (isSynthetic || !shouldDeploy) {
      continue;
    }

    const isLive = !["hardhat", "localhost"].includes(network.name);
    if (isLive) {
      console.warn("WARN: Deploying token on live network");
    }

    const existingToken = await deployments.getOrNull(tokenSymbol);
    if (existingToken) {
      log(`Reusing ${tokenSymbol} at ${existingToken.address}`);
      console.warn(`WARN: bytecode diff is not checked`);
      // address is optional on the union type; cast for assignment after deployment/discovery
      (tokens[tokenSymbol] as any).address = existingToken.address;
      continue;
    }

    const isWrappedNative = Boolean((token as any).wrappedNative);
    const decimals = (token as any).decimals;

    // Debug logging
    console.log(`Deploying token: ${tokenSymbol}`);
    console.log(`Token config:`, {
      decimals,
      wrappedNative: isWrappedNative,
      deploy: shouldDeploy,
      transferGasLimit: (token as any).transferGasLimit,
    });

    if (!isWrappedNative && decimals === undefined) {
      throw new Error(`Token ${tokenSymbol} is missing decimals configuration`);
    }

    const { address, newlyDeployed } = await deploy(tokenSymbol, {
      from: deployer,
      log: true,
      contract: isWrappedNative ? "WNT" : "MintableToken",
      args: isWrappedNative ? [] : [tokenSymbol, tokenSymbol, decimals],
    });

    (tokens[tokenSymbol] as any).address = address;
    if (newlyDeployed) {
      if (isWrappedNative && !network.live) {
        await setBalance(address, expandDecimals(1000, (token as any).decimals));
      }

      if (!isWrappedNative) {
        const tokenContract = await ethers.getContractAt("MintableToken", address);
        await tokenContract.mint(deployer, expandDecimals(1000000000, (token as any).decimals));
      }
    }
  }

  for (const [tokenSymbol, token] of Object.entries(tokens)) {
    if ((token as any).synthetic) {
      continue;
    }

    await setUintIfDifferent(
      keys.tokenTransferGasLimit((token as any).address as string),
      (token as any).transferGasLimit ?? 200_000,
      `${tokenSymbol} transfer gas limit`
    );
  }

  const wrappedEntry = Object.values(tokens).find((t) => (t as any).wrappedNative);
  const wrappedAddress = (wrappedEntry as any)?.address as string | undefined;
  if (!wrappedAddress) {
    throw new Error("No wrapped native token found");
  }
  await setAddressIfDifferent(keys.WNT, wrappedAddress, "WNT");
};

func.tags = ["Tokens"];
func.dependencies = ["DataStore"];
export default func;
