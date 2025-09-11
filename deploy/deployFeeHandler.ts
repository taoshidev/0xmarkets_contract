import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const constructorContracts = ["RoleStore", "Oracle", "DataStore", "EventEmitter"];

const func = createDeployFunction({
  contractName: "FeeHandler",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts, gmx }) => {
    const vaultV1Config = await gmx.getVaultV1();
    const vaultV1Address = vaultV1Config?.vaultV1;
    const gmxAddress = vaultV1Config?.gmx;
    return constructorContracts
      .map((dependencyName) => dependencyContracts[dependencyName].address)
      .concat(vaultV1Address)
      .concat(gmxAddress);
  },
  libraryNames: ["MarketUtils"],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
  },
  // FeeHandler should not be re-deployed as the new FeeHandler would not have
  // the funds from the existing FeeHandler which could lead to errors in
  // buybacks and withdrawal of fees as the amounts in the DataStore would
  // not match the contract balance
  // The migration of funds must be explicitly handled if a re-deploy is required
  id: "FeeHandler_1",
});

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  try {
    const cfg = await hre.gmx.getVaultV1();
    const missingCfg = !cfg?.vaultV1 || !cfg?.gmx;
    if (missingCfg) {
      // Skip if v1 vault / GMX are not configured for this network
      return true;
    }
  } catch (_) {
    // If helper throws or not available, skip to avoid deploy failure
    return true;
  }
  if (hre.network.name === "avalancheFuji") {
    return true;
  }
  return process.env.SKIP_HANDLER_DEPLOYMENTS ? true : false;
};

export default func;
