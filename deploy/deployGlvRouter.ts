import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// Disabled: GLV contracts removed in commit d4af1ba3
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // noop – disabled deploy; touch param to satisfy linter
  void hre;
};
func.skip = async () => true;
export default func;
