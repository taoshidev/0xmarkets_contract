/*
  MVP note: swaps are not supported; keep file for history but disable execution.
  Original contents kept below for reference.

import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore"];

const func = createDeployFunction({
  contractName: "SwapHandler",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["SwapUtils"],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
  },
});

func.skip = async () => {
  return process.env.SKIP_HANDLER_DEPLOYMENTS ? true : false;
};

export default func;
*/

export {}; // intentionally empty to disable this deploy step
