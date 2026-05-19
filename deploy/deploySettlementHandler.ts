import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore", "DataStore", "EventEmitter", "Oracle"];

const func = createDeployFunction({
  contractName: "SettlementHandler",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["MarketStoreUtils", "InsuranceFundUtils"],
  afterDeploy: async ({ deployedContract }) => {
    // CONTROLLER lets the handler call dataStore writes, vault writes, and
    // EventEmitter emits via the InsuranceFundUtils library.
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
  },
});

export default func;
