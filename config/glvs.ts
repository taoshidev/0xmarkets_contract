import { BigNumberish } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

type GlvConfig = {
  name: string;
  symbol: string;

  longToken: string;
  shortToken: string;

  // address is required for updateGlvConfig script
  address?: string;

  // not required, default value will be used if not specified
  transferGasLimit?: number;

  shiftMaxPriceImpactFactor: BigNumberish;
  shiftMinInterval: number;
  minTokensForFirstGlvDeposit: BigNumberish;
  markets: {
    indexToken: string;
    isMarketDisabled?: boolean;
    glvMaxMarketTokenBalanceAmount: BigNumberish;
    glvMaxMarketTokenBalanceUsd: BigNumberish;
  }[];
}[];

export default async function ({ network }: HardhatRuntimeEnvironment) {
  const config: GlvConfig = {
    base: [],
    baseSepolia: [],
    hardhat: [],
    localhost: [],
  }[network.name === "baseSepoliaFork" ? "baseSepolia" : network.name]!;

  if (!config) {
    throw new Error(`Network config not defined for ${network.name}`);
  }

  return config;
}
