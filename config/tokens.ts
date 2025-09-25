import { BigNumberish, ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { percentageToFloat } from "../utils/math";
import { TOKEN_ORACLE_TYPES } from "../utils/oracle";
import { getSyntheticTokenAddress } from "../utils/token";

import { OracleProvider } from "./types";

type OracleRealPriceFeed = {
  address: string;
  decimals: number;
  heartbeatDuration: number;
  stablePrice?: BigNumberish;
  deploy?: never;
  initPrice?: never;
};

type OracleTestPriceFeed = {
  address?: never;
  decimals: number;
  heartbeatDuration: number;
  stablePrice?: BigNumberish;
  deploy: true;
  initPrice: string;
};

type OraclePriceFeed = OracleRealPriceFeed | OracleTestPriceFeed;

type BaseTokenConfig = {
  decimals: number;
  transferGasLimit?: number;
  oracleProvider?: OracleProvider;
  oracleTimestampAdjustment?: number;
  dataStreamFeedId?: string;
  dataStreamFeedDecimals?: number;
  dataStreamSpreadReductionFactor?: BigNumberish;
  priceFeed?: OraclePriceFeed;
};

// synthetic token without corresponding token
// address will be generated in runtime in hardhat.config.ts
// should not be deployed
// should not be wrappedNative
type SyntheticTokenConfig = BaseTokenConfig & {
  address?: never;
  synthetic: true;
  wrappedNative?: never;
  deploy?: never;
  oracleType?: string;
};

type RealTokenConfig = BaseTokenConfig & {
  address: string;
  synthetic?: never;
  wrappedNative?: true;
  deploy?: never;
  buybackMaxPriceImpactFactor?: BigNumberish;
};

// test token to deploy in local and test networks
// automatically deployed in localhost and hardhat networks
// `deploy` should be set to `true` to deploy on live networks
export type TestTokenConfig = BaseTokenConfig & {
  address?: never;
  deploy: true;
  wrappedNative?: boolean;
  synthetic?: never;
};

export type TokenConfig = SyntheticTokenConfig | RealTokenConfig | TestTokenConfig;
export type TokensConfig = { [tokenSymbol: string]: TokenConfig };

const LOW_BUYBACK_IMPACT = percentageToFloat("0.20%");
const MID_BUYBACK_IMPACT = percentageToFloat("0.40%");

const config: {
  [network: string]: TokensConfig;
} = {
  arbitrum: {},
  avalanche: {},
  arbitrumSepolia: {},
  arbitrumGoerli: {},
  avalancheFuji: {},
  // token addresses are retrieved in runtime for hardhat and localhost networks
  hardhat: {
    USDC: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      deploy: true,
    },
    WETH: {
      decimals: 18,
      transferGasLimit: 200 * 1000,
      wrappedNative: true,
      deploy: true,
    },
  },
  localhost: {
    USDC: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      deploy: true,
    },
    WETH: {
      decimals: 18,
      transferGasLimit: 200 * 1000,
      wrappedNative: true,
      deploy: true,
    },
  },
};

export default async function (hre: HardhatRuntimeEnvironment): Promise<TokensConfig> {
  const tokens = config[hre.network.name];

  for (const [tokenSymbol, token] of Object.entries(tokens as TokensConfig)) {
    (token as any).symbol = tokenSymbol;
    if (token.synthetic) {
      (token as any).address = getSyntheticTokenAddress(hre.network.config.chainId, tokenSymbol);
    }
    if (token.address) {
      (token as any).address = ethers.utils.getAddress(token.address);
    }
    if (!hre.network.live) {
      (token as any).deploy = true;
    }

    if (token.oracleType === undefined) {
      token.oracleType = TOKEN_ORACLE_TYPES.DEFAULT;
    }

    if (token.dataStreamSpreadReductionFactor === undefined) {
      token.dataStreamSpreadReductionFactor = percentageToFloat("50%");
    }
  }

  return tokens;
}
