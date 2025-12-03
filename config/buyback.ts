import { BigNumberish } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { percentageToFloat } from "../utils/math";

export type BuybackBatchAmount = {
  token: string;
  amount: BigNumberish;
};

export type BuybackGmxFactor = {
  version: number;
  factor: BigNumberish;
};

export type BuybackConfig = {
  batchAmounts: BuybackBatchAmount[];
  gmxFactors: BuybackGmxFactor[];
  maxPriceAge: number;
};

export default async function (hre: HardhatRuntimeEnvironment): Promise<BuybackConfig> {
  const defaultEmptyConfig = {
    batchAmounts: [],
    gmxFactors: [],
    maxPriceAge: 0,
  };

  const defaultBuybackGmxFactor = [
    {
      version: 1,
      factor: percentageToFloat("30%"),
    },
    {
      version: 2,
      factor: percentageToFloat("72.97%"), // 27 / 37
    },
  ];

  const defaultMaxPriceAge = 30;

  const config: { [network: string]: BuybackConfig } = {
    base: defaultEmptyConfig,
    baseSepolia: defaultEmptyConfig,
    hardhat: defaultEmptyConfig,
    localhost: defaultEmptyConfig,
  };

  const networkConfig: BuybackConfig = config[hre.network.name];

  return networkConfig;
}
