import { grantRoleIfNotGranted } from "../utils/role";
import { setUintIfDifferent, setAddressIfDifferent } from "../utils/dataStore";
import * as keys from "../utils/keys";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore", "DataStore", "EventEmitter"];

const func = createDeployFunction({
  contractName: "Oracle", // 0xMarket: Use enhanced Oracle with dual-oracle validation
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts, gmx }) => {
    const generalConfig = await gmx.getGeneral();
    return constructorContracts
      .map((dependencyName) => dependencyContracts[dependencyName].address)
      .concat(generalConfig.sequencerUptimeFeed);
  },
  afterDeploy: async ({ deployedContract, gmx }) => {
    const oracleConfig = await gmx.getOracle();
    const dualOracleConfig = oracleConfig.dualOracle;
    await setUintIfDifferent(
      keys.MIN_ORACLE_BLOCK_CONFIRMATIONS,
      oracleConfig.minOracleBlockConfirmations,
      "min oracle block confirmations"
    );
    await setUintIfDifferent(keys.MAX_ORACLE_PRICE_AGE, oracleConfig.maxOraclePriceAge, "max oracle price age");
    await setUintIfDifferent(
      keys.MAX_ORACLE_TIMESTAMP_RANGE,
      oracleConfig.maxOracleTimestampRange,
      "max oracle timestamp range"
    );
    await setUintIfDifferent(
      keys.MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR,
      oracleConfig.maxRefPriceDeviationFactor,
      "max ref price deviation factor"
    );
    await setAddressIfDifferent(
      keys.CHAINLINK_PAYMENT_TOKEN,
      oracleConfig.chainlinkPaymentToken,
      "chainlinkPaymentToken"
    );

    // 0xMarket: Configure dual-oracle system
    if (dualOracleConfig?.pythOracleProvider) {
      await setAddressIfDifferent(keys.PYTH_ORACLE_PROVIDER, dualOracleConfig.pythOracleProvider, "pythOracleProvider");
    }

    // Note: Individual token configurations (TTLs, time skew, confidence multipliers)
    // should be set via Config.setPythFeed() or Timelock.setPythFeedAfterSignal()
    // after deployment based on specific FX pair requirements

    // the Oracle contract requires the CONTROLLER to emit events
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER", "oracle");
  },
  id: "Oracle_0xMarket_1", // 0xMarket enhanced Oracle with dual-oracle validation
});

// 0xMarket: Updated dependencies for dual-oracle system
func.dependencies = func.dependencies.concat(["Tokens", "MockDataStreamVerifier"]);

export default func;
