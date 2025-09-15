import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// Disabled: GLV contracts removed; keep file for history.
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  void hre;
};
func.skip = async () => true;
export default func;
