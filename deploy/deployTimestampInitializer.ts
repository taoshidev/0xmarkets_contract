import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// Disabled: TimestampInitializer contract not present in this repo snapshot
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  void hre;
};
func.skip = async () => true;
export default func;
