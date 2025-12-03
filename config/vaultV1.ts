import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

export type VaultV1Config = {
  vaultV1?: string;
};

export default async function (hre: HardhatRuntimeEnvironment): Promise<VaultV1Config> {
  const config: { [network: string]: VaultV1Config } = {
    base: {
      vaultV1: "REPLACE_ME",
      gmx: ethers.constants.AddressZero,
    },
    baseSepolia: {
      vaultV1: "REPLACE_ME",
      gmx: ethers.constants.AddressZero,
    },
    hardhat: {},
    localhost: {
      vaultV1: "REPLACE_ME",
    },
  };

  const vaultV1Config: VaultV1Config = config[hre.network.name];

  return vaultV1Config;
}
