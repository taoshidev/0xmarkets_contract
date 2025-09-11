// import { grantRoleIfNotGranted } from "../utils/role";
// import { createDeployFunction } from "../utils/deploy";

// const constructorContracts = ["RoleStore", "DataStore", "EventEmitter"];

// const func = createDeployFunction({
//   contractName: "GlvFactory",
//   dependencyNames: constructorContracts,
//   libraryNames: ["GlvStoreUtils"],
//   getDeployArgs: async ({ dependencyContracts }) => {
//     return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
//   },
//   afterDeploy: async ({ deployedContract }) => {
//     await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
//   },
//   id: "GlvFactory_2",
// });

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// Disabled: GLV contracts removed in commit d4af1ba3
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  void hre;
};
func.skip = async () => true;
export default func;
