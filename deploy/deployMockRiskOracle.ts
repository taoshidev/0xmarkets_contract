import { HardhatRuntimeEnvironment } from "hardhat/types";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MockRiskOracle",
  getDeployArgs: async ({ getNamedAccounts }) => {
    const { deployer } = await getNamedAccounts();
    // Constructor args: initialSenders, initialUpdateTypes
    const initialSenders = [deployer]; // Authorize the deployer
    const initialUpdateTypes = ["RISK_PARAM_UPDATE", "LIQUIDATION_THRESHOLD"]; // Some default update types
    return [initialSenders, initialUpdateTypes];
  },
});

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  // Only deploy on test networks
  const shouldDeployForNetwork = ["hardhat", "localhost"];
  return !shouldDeployForNetwork.includes(network.name);
};

export default func;
