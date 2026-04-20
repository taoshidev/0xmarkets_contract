import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { setAddressIfDifferent } from "../utils/dataStore";
import * as keys from "../utils/keys";
import { grantRoleIfNotGranted } from "../utils/role";

const func = async ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Grant deployer CONTROLLER role to set addresses in DataStore
  await grantRoleIfNotGranted(deployer, "CONTROLLER");

  for (const [name, symbol] of [
    ["British Pound", "GBP"],
    ["Euro", "EUR"],
    ["Gold", "GOLD"],
    ["Silver", "XAG"],
    ["Japaness Yen", "JPY"],
    ["West Texas Intermediate", "WTI"],
  ]) {
    const nonce = await ethers.provider.getTransactionCount(deployer, "pending");
    const deployment = await deploy(name, {
      contract: "AssetToken",
      from: deployer,
      args: [name, symbol],
      log: true,
      nonce: nonce,
    });

    await setAddressIfDifferent(keys.assetTokenKey(symbol), deployment.address);
  }
};

func.tags = ["Assets"];
func.dependencies = ["DataStore", "RoleStore"];

func.skip = async ({ network }: any) => network.name === "localhost";

export default func;
