import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GovToken",
  id: "GovToken_1",
  dependencyNames: ["RoleStore"],
  getDeployArgs: async ({ dependencyContracts }) => {
    return [
      dependencyContracts.RoleStore.address, // roleStore
      "GMX DAO", // name
      "GMX_DAO", // symbol
      18, // decimals
    ];
  },
});

func.skip = async ({ network }: any) => network.name === "localhost";

export default func;
