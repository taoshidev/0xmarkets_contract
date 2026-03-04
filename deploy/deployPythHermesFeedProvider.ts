import { createDeployFunction } from "../utils/deploy";
import { setBoolIfDifferent } from "../utils/dataStore";
import * as keys from "../utils/keys";

const constructorContracts: string[] = [];

const func = createDeployFunction({
  contractName: "PythHermesFeedProvider",
  dependencyNames: constructorContracts,
  getDeployArgs: async () => {
    return [];
  },
  afterDeploy: async ({ deployedContract }) => {
    await setBoolIfDifferent(
      keys.isOracleProviderEnabledKey(deployedContract.address),
      true,
      "isOracleProviderEnabledKey"
    );
  },
  id: "PythHermesFeedProvider",
});

export default func;
