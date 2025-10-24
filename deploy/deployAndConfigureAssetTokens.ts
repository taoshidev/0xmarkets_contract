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
    ["Japaness Yen", "JPY"],
  ]) {
    const deployment = await deploy(name, {
      contract: "AssetToken",
      from: deployer,
      args: [name, symbol],
      log: true,
    });

    await setAddressIfDifferent(keys.assetTokenKey(symbol), deployment.address);
  }
};

func.tags = ["Assets"];
func.dependencies = ["DataStore", "RoleStore"];

export default func;
