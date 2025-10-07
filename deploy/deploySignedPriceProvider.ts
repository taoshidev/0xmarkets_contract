import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["DataStore"];

const func = createDeployFunction({
  contractName: "SignedPriceProvider",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return [dependencyContracts.DataStore.address];
  },
  id: "SignedPriceProvider_1",
});

func.skip = async ({ network }) => {
  // Only deploy in test/local networks
  return network.live;
};

export default func;
