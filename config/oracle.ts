import { BigNumberish } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { decimalToFloat } from "../utils/math";

export type OracleConfig = {
  signers: string[];
  dataStreamFeedVerifier?: string;
  minOracleSigners: number;
  minOracleBlockConfirmations: number;
  maxOraclePriceAge: number;
  maxOracleTimestampRange: number;
  maxRefPriceDeviationFactor: BigNumberish;
  chainlinkPaymentToken?: string;
  pythLazerFeedVerifier?: string;
};

export default async function (hre: HardhatRuntimeEnvironment): Promise<OracleConfig> {
  const network = hre.network;

  let testSigners: string[];
  if (!network.live) {
    testSigners = (await hre.ethers.getSigners()).slice(10).map((signer) => signer.address);
  }

  const config: { [network: string]: OracleConfig } = {
    base: {
      signers: [],
      minOracleSigners: 0,
      minOracleBlockConfirmations: 255,
      maxOraclePriceAge: 5 * 60,
      maxOracleTimestampRange: 60,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
      pythLazerFeedVerifier: "0xacea761c27a909d4d3895128ebe6370fde2df481",
    },
    baseSepolia: {
      signers: [],
      minOracleSigners: 0,
      minOracleBlockConfirmations: 255,
      maxOraclePriceAge: 5 * 60,
      maxOracleTimestampRange: 60,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
      pythLazerFeedVerifier: "0xacea761c27a909d4d3895128ebe6370fde2df481",
    },
    hardhat: {
      signers: testSigners,
      minOracleSigners: 0,
      minOracleBlockConfirmations: 255,
      maxOraclePriceAge: 60 * 60,
      maxOracleTimestampRange: 60,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%,
      chainlinkPaymentToken: "0x99bbA657f2BbC93c02D617f8bA121cB8Fc104Acf",
    },
    localhost: {
      signers: testSigners,
      minOracleSigners: 0,
      minOracleBlockConfirmations: 255,
      maxOraclePriceAge: 60 * 60,
      maxOracleTimestampRange: 60,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
    },
  };

  const oracleConfig: OracleConfig = config[hre.network.name];

  return oracleConfig;
}
