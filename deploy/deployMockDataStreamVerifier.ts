import { HardhatRuntimeEnvironment } from "hardhat/types";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MockDataStreamVerifier",
});

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  // Only deploy on test networks
  const shouldDeployForNetwork = ["hardhat", "localhost"];
  return !shouldDeployForNetwork.includes(network.name);
};

export default func;
