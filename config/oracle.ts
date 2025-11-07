import { HardhatRuntimeEnvironment } from "hardhat/types";
import { decimalToFloat } from "../utils/math";
import { BigNumberish } from "ethers";

export type DualOracleConfig = {
  pythOracleProvider?: string;
  chainlinkTtl?: number;
  pythTtl?: number;
  maxTimeSkew?: number;
  confidenceMultiplier?: BigNumberish;
  // Global oracle provider configurations
  // These flags indicate when oracle data format differs from market expectation
  oracleProviderConfigs?: {
    chainlink?: {
      // Tokens where Chainlink format differs from market expectation
      // e.g., JPY market (reversed=true) expects USD/JPY, but Chainlink provides JPY/USD
      invertedTokens?: string[];
    };
    pyth?: {
      // Tokens where Pyth format differs from market expectation
      // e.g., if market expects USD/JPY but Pyth provides JPY/USD
      invertedTokens?: string[];
    };
  };

  // Note: Token-specific dual oracle parameters are not needed
  // All tokens use the global defaults above
  // Only inversion flags are configured per-token via oracleProviderConfigs
};

export type OracleConfig = {
  signers: string[];
  dataStreamFeedVerifier?: string;
  minOracleSigners: number;
  minOracleBlockConfirmations: number;
  maxOraclePriceAge: number;
  maxOracleTimestampRange: number;
  maxRefPriceDeviationFactor: BigNumberish;
  chainlinkPaymentToken?: string;
  dualOracle?: DualOracleConfig;
};

export default async function (hre: HardhatRuntimeEnvironment): Promise<OracleConfig> {
  const network = hre.network;

  let testSigners: string[];
  if (!network.live) {
    testSigners = (await hre.ethers.getSigners()).slice(10).map((signer) => signer.address);
  }

  const config: { [network: string]: OracleConfig } = {
    localhost: {
      signers: testSigners,
      minOracleSigners: 0,
      minOracleBlockConfirmations: 255,
      maxOraclePriceAge: 60 * 60,
      maxOracleTimestampRange: 60,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
      chainlinkPaymentToken: "0x99bbA657f2BbC93c02D617f8bA121cB8Fc104Acf", // Same as hardhat
      dualOracle: {
        chainlinkTtl: 2, // 2 seconds
        pythTtl: 2, // 2 seconds
        maxTimeSkew: 600, // 600ms
        confidenceMultiplier: decimalToFloat(3), // K=3
        oracleProviderConfigs: {
          chainlink: {
            // Chainlink provides JPY/USD (normal Asset/USD format)
            // JPY market is NOT reversed from Chainlink's perspective
            invertedTokens: [],
          },
          pyth: {
            // Pyth provides USD/JPY (FX convention, matches market reversed=true)
            // JPY token is inverted/reversed, so Pyth should be marked as inverted
            invertedTokens: ["JPY"],
          },
        },
      },
    },
    hardhat: {
      signers: testSigners,
      minOracleSigners: 0,
      minOracleBlockConfirmations: 255,
      maxOraclePriceAge: 60 * 60,
      maxOracleTimestampRange: 60,
      chainlinkPaymentToken: "0x99bbA657f2BbC93c02D617f8bA121cB8Fc104Acf",
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
      dualOracle: {
        chainlinkTtl: 2,
        pythTtl: 2,
        maxTimeSkew: 600,
        confidenceMultiplier: decimalToFloat(3),
        oracleProviderConfigs: {
          chainlink: {
            // Chainlink provides JPY/USD (normal Asset/USD format)
            // JPY market is NOT reversed from Chainlink's perspective
            invertedTokens: [],
          },
          pyth: {
            // Pyth provides USD/JPY (FX convention, matches market reversed=true)
            // JPY token is inverted/reversed, so Pyth should be marked as inverted
            invertedTokens: ["JPY"],
          },
        },
      },
    },
  };

  const oracleConfig: OracleConfig = config[hre.network.name];

  return oracleConfig;
}
