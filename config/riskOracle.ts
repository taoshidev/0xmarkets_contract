import { HardhatRuntimeEnvironment } from "hardhat/types";

export type RiskOracleConfig = {
  riskOracle?: string;
  markets?: {
    [marketAddress: string]: {
      syncConfigMarketDisabled?: boolean;
      parameters?: {
        [parameter: string]: boolean;
      };
    };
  };
  parameters?: {
    [parameter: string]: boolean;
  };
};

export default async function (hre: HardhatRuntimeEnvironment): Promise<RiskOracleConfig> {
  const config: { [network: string]: RiskOracleConfig } = {
    hardhat: {},
    localhost: {},
  };

  const riskOracleConfig: RiskOracleConfig = config[hre.network.name];

  if (riskOracleConfig.markets) {
    for (const [marketAddress, marketConfig] of Object.entries(riskOracleConfig.markets)) {
      if ("syncConfigMarketDisabled" in marketConfig) {
        if (typeof marketConfig.syncConfigMarketDisabled !== "boolean") {
          throw new Error(`syncConfigMarketDisabled for market ${marketAddress} must be a boolean.`);
        }
      }

      if (marketConfig.parameters) {
        for (const [parameterKey, parameterValue] of Object.entries(marketConfig.parameters)) {
          if (typeof parameterValue !== "boolean") {
            throw new Error(`Parameter ${parameterKey} for market ${marketAddress} must be a boolean.`);
          }
        }
      }
    }
  }

  if (riskOracleConfig.parameters) {
    for (const [parameterKey, parameterValue] of Object.entries(riskOracleConfig.parameters)) {
      if (typeof parameterValue !== "boolean") {
        throw new Error(`parameter ${parameterKey} must be a boolean.`);
      }
    }
  }

  return riskOracleConfig;
}
