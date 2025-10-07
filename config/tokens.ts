import { BigNumberish, ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as keys from "../utils/keys";
import { percentageToFloat, decimalToFloat } from "../utils/math";
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
  oracleType?: string;
  dataStreamFeedId?: string;
  dataStreamFeedDecimals?: number;
  dataStreamSpreadReductionFactor?: BigNumberish;
  priceFeed?: OraclePriceFeed;
  pythFeedId?: string;
  // Note: Dual oracle configuration is handled globally in oracle.ts
  // Oracle inversion per token is configured in oracle.ts oracleProviderConfigs
};

type AssetTokenConfig = BaseTokenConfig & {
  address?: never;
  deploy?: false;
  isAsset: true;
  isSynthetic?: false;
  wrappedNative?: false;
};

type RealTokenConfig = BaseTokenConfig & {
  address: string;
  deploy?: false;
  isAsset?: false;
  isSynthetic?: false;
  wrappedNative?: boolean;
  buybackMaxPriceImpactFactor?: BigNumberish;
};

// synthetic token without corresponding token
// address will be generated in runtime in hardhat.config.ts
// should not be deployed
// should not be wrappedNative
type SyntheticTokenConfig = BaseTokenConfig & {
  address?: never;
  deploy?: false;
  isAsset?: false;
  isSynthetic: true;
  wrappedNative?: false;
};

// test token to deploy in local and test networks
// automatically deployed in localhost and hardhat networks
// `deploy` should be set to `true` to deploy on live networks
export type TestTokenConfig = BaseTokenConfig & {
  address?: never;
  deploy: true;
  isAsset?: false;
  isSynthetic?: false;
  wrappedNative?: boolean;
};

export type TokenConfig = AssetTokenConfig | RealTokenConfig | SyntheticTokenConfig | TestTokenConfig;
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
    EUR: {
      decimals: 6,
      isAsset: true,
    },
    GBP: {
      decimals: 6,
      isAsset: true,
    },
    GOLD: {
      decimals: 6,
      isAsset: true,
    },
    JPY: {
      decimals: 6,
      isAsset: true,
    },
    USDC: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      deploy: true,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 86400,
        deploy: true,
        initPrice: "100000000", // $1.00 with 8 decimals
      },
    },
    USDT: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      deploy: true,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 86400,
        deploy: true,
        initPrice: "100000000", // $1.00 with 8 decimals
      },
    },
    WBTC: {
      decimals: 8,
      transferGasLimit: 200 * 1000,
      deploy: true,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 86400,
        deploy: true,
        initPrice: "5000000000000", // $50,000 with 8 decimals
      },
    },
    WETH: {
      decimals: 18,
      transferGasLimit: 200 * 1000,
      wrappedNative: true,
      deploy: true,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 86400,
        deploy: true,
        initPrice: "500000000000", // $5,000 with 8 decimals
      },
    },
  },
  localhost: {
    EUR: {
      decimals: 6,
      isAsset: true,
    },
    GBP: {
      decimals: 6,
      isAsset: true,
    },
    GOLD: {
      decimals: 6,
      isAsset: true,
    },
    JPY: {
      decimals: 6,
      isAsset: true,
    },
    USDC: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      deploy: true,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 86400,
        deploy: true,
        initPrice: "100000000", // $1.00 with 8 decimals
      },
    },
    USDT: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      deploy: true,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 86400,
        deploy: true,
        initPrice: "100000000", // $1.00 with 8 decimals
      },
    },
    WBTC: {
      decimals: 8,
      transferGasLimit: 200 * 1000,
      deploy: true,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 86400,
        deploy: true,
        initPrice: "5000000000000", // $50,000 with 8 decimals
      },
    },
    WETH: {
      decimals: 18,
      transferGasLimit: 200 * 1000,
      wrappedNative: true,
      deploy: true,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 86400,
        deploy: true,
        initPrice: "500000000000", // $5,000 with 8 decimals
      },
    },
  },
};

async function getAssetAddress(hre, key: string) {
  const { read } = hre.deployments;
  return await read("DataStore", "getAddress", key);
}

export default async function (hre: HardhatRuntimeEnvironment): Promise<TokensConfig> {
  const tokens = config[hre.network.name];

  for (const [tokenSymbol, token] of Object.entries(tokens as TokensConfig)) {
    (token as any).symbol = tokenSymbol;

    if (token.isAsset) {
      (token as any).address = await getAssetAddress(hre, keys.assetTokenKey(tokenSymbol));
    }

    if (token.isSynthetic) {
      (token as any).address = getSyntheticTokenAddress(hre.network.config.chainId, tokenSymbol);
    }

    if (token.address) {
      (token as any).address = ethers.utils.getAddress(token.address);
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
