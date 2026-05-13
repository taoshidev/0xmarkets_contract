import { setBoolIfDifferent } from "../utils/dataStore";
import { createDeployFunction } from "../utils/deploy";
import * as keys from "../utils/keys";

const constructorContracts = ["DataStore"];

const func = createDeployFunction({
  contractName: "PythLazerFeedProvider",
  dependencyNames: constructorContracts,
  libraryNames: ["PythLazerLib"],
  getDeployArgs: async ({ dependencyContracts, get, gmx, network }) => {
    const oracleConfig = await gmx.getOracle();
    let pythLazerFeedVerifierAddress = oracleConfig.pythLazerFeedVerifier;
    if (network.name === "hardhat" || network.name === "localhost") {
      const pythLazerFeedVerifier = await get("MockPythLazer");
      pythLazerFeedVerifierAddress = pythLazerFeedVerifier.address;
    }
    if (!pythLazerFeedVerifierAddress) {
      throw new Error("pythLazerFeedVerifierAddress is not defined");
    }

    return constructorContracts
      .map((dependencyName) => dependencyContracts[dependencyName].address)
      .concat(pythLazerFeedVerifierAddress);
  },
  afterDeploy: async ({ deployedContract }) => {
    await setBoolIfDifferent(
      keys.isOracleProviderEnabledKey(deployedContract.address),
      true,
      "isOracleProviderEnabledKey"
    );
  },
  id: "PythLazerFeedProvider",
});

export default func;
