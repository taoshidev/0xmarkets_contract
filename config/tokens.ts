import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getSyntheticTokenAddress } from "../utils/token";
import * as keys from "../utils/keys";
import { decimalToFloat, percentageToFloat } from "../utils/math";
import { BigNumberish } from "ethers";
import { TOKEN_ORACLE_TYPES } from "../utils/oracle";

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
};

type AssetToekenConfig = BaseTokenConfig & {
  address?: never;
  isAsset: true;
  isSynthetic?: false;
  wrappedNative?: never;
  deploy?: never;
};

// synthetic token without corresponding token
// address will be generated in runtime in hardhat.config.ts
// should not be deployed
// should not be wrappedNative
type SyntheticTokenConfig = BaseTokenConfig & {
  address?: never;
  isAsset?: false;
  isSynthetic: true;
  wrappedNative?: never;
  deploy?: never;
  oracleType?: string;
};

type RealTokenConfig = BaseTokenConfig & {
  address: string;
  isAsset?: false;
  isSynthetic?: false;
  wrappedNative?: boolean;
  deploy?: never;
  buybackMaxPriceImpactFactor?: BigNumberish;
};

// test token to deploy in local and test networks
// automatically deployed in localhost and hardhat networks
// `deploy` should be set to `true` to deploy on live networks
export type TestTokenConfig = BaseTokenConfig & {
  address?: never;
  isAsset?: false;
  isSynthetic?: false;
  wrappedNative?: boolean;
  deploy: true;
};

export type TokenConfig = AssetToekenConfig | SyntheticTokenConfig | RealTokenConfig | TestTokenConfig;
export type TokensConfig = { [tokenSymbol: string]: TokenConfig };

const LOW_BUYBACK_IMPACT = percentageToFloat("0.20%");
const MID_BUYBACK_IMPACT = percentageToFloat("0.40%");

const config: {
  [network: string]: TokensConfig;
} = {
  hardhat: {
    EUR: {
      decimals: 6,
      isAsset: true,
    },
    GBP: {
      decimals: 6,
      isAsset: true,
    },
    GMX: {
      decimals: 18,
      transferGasLimit: 200 * 1000,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 24 * 60 * 60,
        deploy: true,
        initPrice: "10000000000",
      },
      deploy: true,
    },
    GOLD: {
      decimals: 6,
      isAsset: true,
    },
    JPY: {
      decimals: 6,
      isAsset: true,
    },
    SOL: {
      decimals: 18,
      isSynthetic: true,
    },
    USDC: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 24 * 60 * 60,
        deploy: true,
        initPrice: "100000000",
      },
      deploy: true,
    },
    USDT: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 24 * 60 * 60,
        deploy: true,
        initPrice: "100000000",
      },
      deploy: true,
    },
    WBTC: {
      decimals: 8,
      transferGasLimit: 200 * 1000,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 24 * 60 * 60,
        deploy: true,
        initPrice: "10000000000000",
      },
      deploy: true,
    },
    WETH: {
      decimals: 18,
      transferGasLimit: 200 * 1000,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 24 * 60 * 60,
        deploy: true,
        initPrice: "500000000000",
      },
      wrappedNative: true,
      deploy: true,
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
    GMX: {
      decimals: 18,
      transferGasLimit: 200 * 1000,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 24 * 60 * 60,
        deploy: true,
        initPrice: "10000000000",
      },
      deploy: true,
    },
    GOLD: {
      decimals: 6,
      isAsset: true,
    },
    JPY: {
      decimals: 6,
      isAsset: true,
    },
    SOL: {
      decimals: 18,
      isSynthetic: true,
    },
    USDC: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 24 * 60 * 60,
        deploy: true,
        initPrice: "100000000",
      },
      deploy: true,
    },
    USDT: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 24 * 60 * 60,
        deploy: true,
        initPrice: "100000000",
      },
      deploy: true,
    },
    WBTC: {
      decimals: 8,
      transferGasLimit: 200 * 1000,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 24 * 60 * 60,
        deploy: true,
        initPrice: "10000000000000",
      },
      deploy: true,
    },
    WETH: {
      decimals: 18,
      transferGasLimit: 200 * 1000,
      priceFeed: {
        decimals: 8,
        heartbeatDuration: 24 * 60 * 60,
        deploy: true,
        initPrice: "300000000000",
      },
      wrappedNative: true,
      deploy: true,
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
