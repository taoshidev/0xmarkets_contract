import { BigNumberish } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { percentageToFloat, expandDecimals, decimalToFloat } from "../utils/math";

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
  const config: GlvConfig = {}[network.name]!;

  if (!config) {
    throw new Error(`Network config not defined for ${network.name}`);
  }

  return config;
}
