import { BigNumberish, ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as keys from "../utils/keys";
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
  oracleType?: string;
  dataStreamFeedId?: string;
  dataStreamFeedDecimals?: number;
  dataStreamInverted?: boolean;
  dataStreamSpreadReductionFactor?: BigNumberish;
  priceFeed?: OraclePriceFeed;
  pythLazerFeedId?: number;
  pythLazerFeedDecimals?: number;
  pythLazerFeedInverted?: boolean;
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
  base: {
    EUR: {
      decimals: 6,
      pythLazerFeedId: 327,
      pythLazerFeedDecimals: 5,
      isAsset: true,
    },
    GBP: {
      decimals: 6,
      pythLazerFeedId: 333,
      pythLazerFeedDecimals: 5,
      isAsset: true,
    },
    GOLD: {
      decimals: 6,
      pythLazerFeedId: 346, // XAUUSD
      pythLazerFeedDecimals: 3,
      isAsset: true,
    },
    JPY: {
      decimals: 6,
      pythLazerFeedId: 340,
      pythLazerFeedDecimals: 3,
      pythLazerFeedInverted: true,
      isAsset: true,
    },
    USDC: {
      address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      decimals: 6,
      transferGasLimit: 200 * 1000,
      pythLazerFeedId: 7,
      pythLazerFeedDecimals: 8,
    },
    WBTC: {
      address: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c",
      decimals: 8,
      transferGasLimit: 200 * 1000,
      pythLazerFeedId: 1,
      pythLazerFeedDecimals: 8,
    },
    WETH: {
      address: "0x4200000000000000000000000000000000000006",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      pythLazerFeedId: 2,
      pythLazerFeedDecimals: 8,
      wrappedNative: true,
    },
  },
  baseSepolia: {
    EUR: {
      decimals: 6,
      pythLazerFeedId: 327,
      pythLazerFeedDecimals: 5,
      isAsset: true,
    },
    GBP: {
      decimals: 6,
      pythLazerFeedId: 333,
      pythLazerFeedDecimals: 5,
      isAsset: true,
    },
    GOLD: {
      decimals: 6,
      pythLazerFeedId: 346, // XAUUSD
      pythLazerFeedDecimals: 3,
      isAsset: true,
    },
    JPY: {
      decimals: 6,
      pythLazerFeedId: 340,
      pythLazerFeedDecimals: 3,
      pythLazerFeedInverted: true,
      isAsset: true,
    },
    USDC: {
      address: "0xA36a6765cc50b1F4678fA91770dcfCf48727730F", // Mock USDC
      decimals: 6,
      transferGasLimit: 200 * 1000,
      pythLazerFeedId: 7,
      pythLazerFeedDecimals: 8,
    },
    WBTC: {
      address: "0xD8a6E3FCA403d79b6AD6216b60527F51cc967D39",
      decimals: 8,
      transferGasLimit: 200 * 1000,
      pythLazerFeedId: 1,
      pythLazerFeedDecimals: 8,
    },
    WETH: {
      address: "0x4200000000000000000000000000000000000006",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      pythLazerFeedId: 2,
      pythLazerFeedDecimals: 8,
      wrappedNative: true,
    },
  },
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
