import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore", "DataStore"];

const func = createDeployFunction({
  contractName: "GlvVault",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  id: "GlvVault_1",
});

func.skip = async ({ network }: any) => network.name === "localhost";

export default func;
