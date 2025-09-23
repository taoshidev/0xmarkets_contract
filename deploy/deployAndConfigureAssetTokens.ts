import { HardhatRuntimeEnvironment } from "hardhat/types";
import { setAddressIfDifferent } from "../utils/dataStore";
import * as keys from "../utils/keys";

const func = async ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

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
func.dependencies = ["DataStore"];

export default func;
