import { setBoolIfDifferent } from "../utils/dataStore";
import { createDeployFunction } from "../utils/deploy";
import * as keys from "../utils/keys";

const constructorContracts = ["DataStore"];

const func = createDeployFunction({
  contractName: "SignedPriceProvider",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return [dependencyContracts.DataStore.address];
  },
  afterDeploy: async ({ deployedContract }) => {
    await setBoolIfDifferent(
      keys.isOracleProviderEnabledKey(deployedContract.address),
      true,
      "isOracleProviderEnabledKey"
    );

    await setBoolIfDifferent(
      keys.isAtomicOracleProviderKey(deployedContract.address),
      true,
      "isAtomicOracleProviderKey"
    );
  },
  id: "SignedPriceProvider_1",
});

func.skip = async ({ network }) => {
  // Only deploy in test/local networks
  return network.live;
};

export default func;
