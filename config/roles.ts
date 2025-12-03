import { HardhatRuntimeEnvironment } from "hardhat/types";

export type RolesConfig = {
  roles: {
    [role: string]: {
      [account: string]: boolean;
    };
  };
  requiredRolesForContracts: {
    [role: string]: string[];
  };
};

const requiredRolesForContracts = {
  CONTROLLER: [
    "Config",
    "MarketFactory",
    "GlvFactory",
    "Timelock",
    "OracleStore",
    "Oracle",
    "ConfigSyncer",

    "ExchangeRouter",
    "SubaccountRouter",
    "GlvRouter",
    "GelatoRelayRouter",
    "SubaccountGelatoRelayRouter",

    "OrderHandler",
    "DepositHandler",
    "WithdrawalHandler",
    "AdlHandler",
    "LiquidationHandler",
    "ShiftHandler",
    "GlvHandler",
    "FeeHandler",
    "SwapHandler",
  ],
  ROUTER_PLUGIN: [
    "ExchangeRouter",
    "SubaccountRouter",
    "GlvRouter",
    "GelatoRelayRouter",
    "SubaccountGelatoRelayRouter",
  ],
  ROLE_ADMIN: ["Timelock"],
  CONFIG_KEEPER: ["ConfigSyncer"],
};

// roles are granted in deploy/configureRoles.ts
// to add / remove roles after deployment, scripts/updateRoles.ts can be used
export default async function (hre: HardhatRuntimeEnvironment): Promise<RolesConfig> {
  const { deployer } = await hre.getNamedAccounts();

  const roles: {
    [network: string]: {
      [role: string]: {
        [account: string]: boolean;
      };
    };
  } = {
    base: {
      // TODO: fill in proper addresses for mainnet roles
      ADL_KEEPER: {},
      CONFIG_KEEPER: {},
      CONTROLLER: {},
      FEE_KEEPER: {},
      FROZEN_ORDER_KEEPER: {},
      GOV_TOKEN_CONTROLLER: {},
      LIQUIDATION_KEEPER: {},
      MARKET_KEEPER: {},
      ORDER_KEEPER: {},
      ROLE_ADMIN: {},
      ROUTER_PLUGIN: {},
      TIMELOCK_ADMIN: {},
      TIMELOCK_MULTISIG: {},
    },
    baseSepolia: {
      ADL_KEEPER: { [deployer]: true },
      CONFIG_KEEPER: { [deployer]: true },
      CONTROLLER: { [deployer]: true },
      FEE_KEEPER: { [deployer]: true },
      FROZEN_ORDER_KEEPER: { [deployer]: true },
      GOV_TOKEN_CONTROLLER: { [deployer]: true },
      LIQUIDATION_KEEPER: { [deployer]: true },
      MARKET_KEEPER: { [deployer]: true },
      ORDER_KEEPER: { [deployer]: true },
      ROLE_ADMIN: { [deployer]: true },
      ROUTER_PLUGIN: { [deployer]: true },
      TIMELOCK_ADMIN: { [deployer]: true },
      TIMELOCK_MULTISIG: { [deployer]: true },
    },
    hardhat: {
      ADL_KEEPER: { [deployer]: true },
      CONFIG_KEEPER: { [deployer]: true },
      CONTROLLER: { [deployer]: true },
      FROZEN_ORDER_KEEPER: { [deployer]: true },
      LIMITED_CONFIG_KEEPER: { [deployer]: true },
      LIQUIDATION_KEEPER: { [deployer]: true },
      MARKET_KEEPER: { [deployer]: true },
      ORDER_KEEPER: { [deployer]: true },
    },
    localhost: {
      ADL_KEEPER: { [deployer]: true },
      CONFIG_KEEPER: { [deployer]: true },
      CONTROLLER: { [deployer]: true },
      FROZEN_ORDER_KEEPER: { [deployer]: true },
      LIMITED_CONFIG_KEEPER: { [deployer]: true },
      LIQUIDATION_KEEPER: { [deployer]: true },
      MARKET_KEEPER: { [deployer]: true },
      ORDER_KEEPER: { [deployer]: true },
    },
  };

  // normalize addresses
  for (const rolesForNetwork of Object.values(roles)) {
    for (const accounts of Object.values(rolesForNetwork)) {
      for (const account of Object.keys(accounts)) {
        const checksumAccount = ethers.utils.getAddress(account);
        if (account !== checksumAccount) {
          accounts[checksumAccount] = accounts[account];
          delete accounts[account];
        }
      }
    }
  }

  return {
    roles: roles[hre.network.name],
    requiredRolesForContracts,
  };
}
