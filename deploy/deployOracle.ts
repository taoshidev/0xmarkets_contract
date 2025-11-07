import { grantRoleIfNotGranted } from "../utils/role";
import { setUintIfDifferent, setAddressIfDifferent, setBoolIfDifferent } from "../utils/dataStore";
import * as keys from "../utils/keys";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore", "DataStore", "EventEmitter"];

const func = createDeployFunction({
  contractName: "Oracle", // 0xMarket: Use enhanced Oracle with dual-oracle validation
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts, gmx }: any) => {
    const generalConfig = await gmx.getGeneral();
    return constructorContracts
      .map((dependencyName) => dependencyContracts[dependencyName].address)
      .concat(generalConfig.sequencerUptimeFeed);
  },
  afterDeploy: async ({ deployedContract, gmx }: any) => {
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

    // Configure oracle provider inversion settings (global configuration)
    if (dualOracleConfig?.oracleProviderConfigs) {
      const tokens = await gmx.getTokens();

      // Configure Chainlink inverted tokens
      if (dualOracleConfig.oracleProviderConfigs.chainlink?.invertedTokens) {
        for (const tokenSymbol of dualOracleConfig.oracleProviderConfigs.chainlink.invertedTokens) {
          const token = tokens[tokenSymbol];
          if (token?.address) {
            console.log(`Configuring Chainlink as inverted for ${tokenSymbol}`);
            await setBoolIfDifferent(
              keys.chainlinkOracleInvertedKey(token.address),
              true,
              `chainlinkInverted for ${tokenSymbol}`
            );
          }
        }
      }

      // Configure Pyth inverted tokens
      if (dualOracleConfig.oracleProviderConfigs.pyth?.invertedTokens) {
        for (const tokenSymbol of dualOracleConfig.oracleProviderConfigs.pyth.invertedTokens) {
          const token = tokens[tokenSymbol];
          if (token?.address) {
            console.log(`Configuring Pyth as inverted for ${tokenSymbol}`);
            await setBoolIfDifferent(
              keys.pythOracleInvertedKey(token.address),
              true,
              `pythInverted for ${tokenSymbol}`
            );
          }
        }
      }
    }

    // Configure dual oracle parameters per token
    if (dualOracleConfig) {
      const tokens = await gmx.getTokens();

      for (const [tokenSymbol, tokenConfig] of Object.entries(tokens)) {
        const token = tokenConfig as any;
        if (!token.address) continue;

        // Set Chainlink TTL per token
        if (dualOracleConfig.chainlinkTtl) {
          await setUintIfDifferent(
            keys.chainlinkOracleTTLKey(token.address),
            dualOracleConfig.chainlinkTtl,
            `chainlinkTtl for ${tokenSymbol}`
          );
        }

        // Set Pyth TTL per token
        if (dualOracleConfig.pythTtl) {
          await setUintIfDifferent(
            keys.pythOracleTTLKey(token.address),
            dualOracleConfig.pythTtl,
            `pythTtl for ${tokenSymbol}`
          );
        }

        // Set max time skew per token
        if (dualOracleConfig.maxTimeSkew) {
          await setUintIfDifferent(
            keys.maxOracleTimeSkewKey(token.address),
            dualOracleConfig.maxTimeSkew,
            `maxTimeSkew for ${tokenSymbol}`
          );
        }

        // Set confidence multiplier per token
        if (dualOracleConfig.confidenceMultiplier) {
          await setUintIfDifferent(
            keys.pythConfidenceMultiplierKey(token.address),
            dualOracleConfig.confidenceMultiplier,
            `confidenceMultiplier for ${tokenSymbol}`
          );
        }
      }
    }

    console.log("✓ Dual oracle configuration completed - global defaults and inversion flags configured");

    // the Oracle contract requires the CONTROLLER to emit events
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER", "oracle");
  },
  id: "Oracle_0xMarket_1", // 0xMarket enhanced Oracle with dual-oracle validation
});

// 0xMarket: Updated dependencies for dual-oracle system
func.dependencies = func.dependencies.concat(["Tokens", "MockDataStreamVerifier", "PythFeeds"]);

export default func;
