/*
  MVP note: swaps are not supported; keep file for history but disable execution.
  Original contents kept below for reference.

import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "SwapPricingUtils",
  libraryNames: [],
});

export default func;
*/

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// Disabled: swaps not supported
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  void hre;
};
func.skip = async () => true;
export default func;
