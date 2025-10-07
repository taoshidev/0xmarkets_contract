import hre from "hardhat";

import { expandDecimals } from "./math";
import { hashData } from "./hash";
import { getMarketTokenAddress } from "./market";
import { getSyntheticTokenAddress } from "./token";
import * as keys from "./keys";
// import { getGlvAddress } from "./glv"; // GLV disabled

export async function deployFixture() {
  await hre.deployments.fixture();
  const chainId = 31337; // hardhat chain id
  const accountList = await hre.ethers.getSigners();
  const [
    wallet,
    user0,
    user1,
    user2,
    user3,
    user4,
    user5,
    user6,
    user7,
    user8,
    signer0,
    signer1,
    signer2,
    signer3,
    signer4,
    signer5,
    signer6,
    signer7,
    signer8,
    signer9,
  ] = accountList;

  const wnt = await hre.ethers.getContract("WETH");
  await wnt.deposit({ value: expandDecimals(50, 18) });

  // const gmx = await hre.ethers.getContract("GMX"); // 0xMarket: GMX token not used

  const wbtc = await hre.ethers.getContract("WBTC");
  const sol = { address: getSyntheticTokenAddress(hre.network.config.chainId, "SOL") };

  const usdc = await hre.ethers.getContract("USDC");
  const usdt = await hre.ethers.getContract("USDT");

  const usdcPriceFeed = await hre.ethers.getContract("USDCPriceFeed");
  await usdcPriceFeed.setAnswer(expandDecimals(1, 8));

  const usdtPriceFeed = await hre.ethers.getContract("USDTPriceFeed");
  await usdtPriceFeed.setAnswer(expandDecimals(1, 8));

  const wethPriceFeed = await hre.ethers.getContract("WETHPriceFeed");
  await wethPriceFeed.setAnswer(expandDecimals(5000, 8));

  // const gmxPriceFeed = await hre.ethers.getContract("GMXPriceFeed"); // 0xMarket: GMX token not used
  // await gmxPriceFeed.setAnswer(expandDecimals(20, 8));

  const oracleSalt = hashData(["uint256", "string"], [chainId, "xget-oracle-v1"]);

  const config = await hre.ethers.getContract("Config");
  const configSyncer = await hre.ethers.getContract("ConfigSyncer");
  const mockRiskOracle = await hre.ethers.getContract("MockRiskOracle");
  const timelock = await hre.ethers.getContract("Timelock");
  const reader = await hre.ethers.getContract("Reader");
  // const glvReader = await hre.ethers.getContract("GlvReader"); // GLV disabled
  const roleStore = await hre.ethers.getContract("RoleStore");
  const dataStore = await hre.ethers.getContract("DataStore");
  const depositVault = await hre.ethers.getContract("DepositVault");
  const withdrawalVault = await hre.ethers.getContract("WithdrawalVault");
  // const shiftVault = await hre.ethers.getContract("ShiftVault"); // Shift disabled
  const eventEmitter = await hre.ethers.getContract("EventEmitter");
  // const oracleStore = await hre.ethers.getContract("OracleStore"); // 0xMarket: OracleStore removed
  const orderVault = await hre.ethers.getContract("OrderVault");
  // const glvVault = await hre.ethers.getContract("GlvVault");
  const marketFactory = await hre.ethers.getContract("MarketFactory");
  // const glvFactory = await hre.ethers.getContract("GlvFactory");
  // const glvHandler = await hre.ethers.getContract("GlvHandler");
  // const glvRouter = await hre.ethers.getContract("GlvRouter");
  // const glvDepositStoreUtils = await hre.ethers.getContract("GlvDepositStoreUtils");
  // const glvWithdrawalStoreUtils = await hre.ethers.getContract("GlvWithdrawalStoreUtils");
  // const glvShiftStoreUtils = await hre.ethers.getContract("GlvShiftStoreUtils");
  // const glvStoreUtils = await hre.ethers.getContract("GlvStoreUtils");
  const depositHandler = await hre.ethers.getContract("DepositHandler");
  const depositUtils = await hre.ethers.getContract("DepositUtils");
  const executeDepositUtils = await hre.ethers.getContract("ExecuteDepositUtils");
  const withdrawalHandler = await hre.ethers.getContract("WithdrawalHandler");
  // const shiftHandler = await hre.ethers.getContract("ShiftHandler"); // Shift disabled
  const orderHandler = await hre.ethers.getContract("OrderHandler");
  const baseOrderUtils = await hre.ethers.getContract("BaseOrderUtils");
  const orderUtils = await hre.ethers.getContract("OrderUtils");
  const liquidationHandler = await hre.ethers.getContract("LiquidationHandler");
  const adlHandler = await hre.ethers.getContract("AdlHandler");
  const router = await hre.ethers.getContract("Router");
  const exchangeRouter = await hre.ethers.getContract("ExchangeRouter");
  const gelatoRelayRouter = await hre.ethers.getContract("GelatoRelayRouter");
  const subaccountGelatoRelayRouter = await hre.ethers.getContract("SubaccountGelatoRelayRouter");
  const subaccountRouter = await hre.ethers.getContract("SubaccountRouter");
  const oracle = await hre.ethers.getContract("Oracle");
  // const gmOracleProvider = await hre.ethers.getContract("GmOracleProvider"); // 0xMarket: GmOracleProvider removed
  const chainlinkPriceFeedProvider = await hre.ethers.getContract("ChainlinkPriceFeedAdapter");
  const chainlinkDataStreamProvider = await hre.ethers.getContract("ChainlinkDataStreamAdapter");
  const marketUtils = await hre.ethers.getContract("MarketUtils");
  const marketStoreUtils = await hre.ethers.getContract("MarketStoreUtils");
  const depositStoreUtils = await hre.ethers.getContract("DepositStoreUtils");
  const withdrawalStoreUtils = await hre.ethers.getContract("WithdrawalStoreUtils");
  // const shiftStoreUtils = await hre.ethers.getContract("ShiftStoreUtils"); // Shift disabled
  const positionStoreUtils = await hre.ethers.getContract("PositionStoreUtils");
  const orderStoreUtils = await hre.ethers.getContract("OrderStoreUtils");
  const decreasePositionUtils = await hre.ethers.getContract("DecreasePositionUtils");
  const increaseOrderUtils = await hre.ethers.getContract("IncreaseOrderUtils");
  const increasePositionUtils = await hre.ethers.getContract("IncreasePositionUtils");
  const positionUtils = await hre.ethers.getContract("PositionUtils");
  // const swapUtils = await hre.ethers.getContract("SwapUtils"); // MVP: swaps disabled
  const referralStorage = await hre.ethers.getContract("ReferralStorage");
  // helper to fetch optional contracts that may be skipped in this snapshot
  const getOptionalContract = async (name: string) => {
    try {
      return await hre.ethers.getContract(name);
    } catch (_err) {
      return undefined as any;
    }
  };
  const feeHandler = await getOptionalContract("FeeHandler");
  // const mockVaultV1 = await hre.ethers.getContract("MockVaultV1"); // removed

  // Ensure holding address is configured to avoid EmptyHoldingAddress on withdrawals
  const currentHolding = await dataStore.getAddress(keys.HOLDING_ADDRESS);
  if (currentHolding === hre.ethers.constants.AddressZero) {
    const deployer = wallet.address;
    await (
      await config.multicall([
        config.interface.encodeFunctionData("setAddress", [keys.HOLDING_ADDRESS, "0x", deployer]),
      ])
    ).wait();
  }

  // 0xMarket: Markets use USDC for both long and short tokens
  const ethUsdMarketAddress = getMarketTokenAddress(
    wnt.address,
    usdc.address,
    usdc.address,
    false, // reversed
    marketFactory.address,
    roleStore.address,
    dataStore.address
  );
  const ethUsdMarket = await reader.getMarket(dataStore.address, ethUsdMarketAddress);

  // 0xMarket: Markets use USDC for both long and short tokens (USDT market not used)
  const ethUsdtMarketAddress = ethUsdMarketAddress; // Same as ethUsdMarket
  const ethUsdtMarket = ethUsdMarket;

  // 0xMarket: Spot-only markets also use USDC for both tokens
  const ethUsdSpotOnlyMarketAddress = ethUsdMarketAddress; // Same as ethUsdMarket
  const ethUsdSpotOnlyMarket = ethUsdMarket;

  const ethUsdSingleTokenMarketAddress = ethUsdMarketAddress; // Same as ethUsdMarket
  const ethUsdSingleTokenMarket = ethUsdMarket;

  // 0xMarket: All markets use USDC for both long and short tokens
  const ethUsdSingleTokenMarket2Address = ethUsdMarketAddress; // Same as ethUsdMarket
  const ethUsdSingleTokenMarket2 = ethUsdMarket;

  const btcUsdMarketAddress = getMarketTokenAddress(
    wbtc.address,
    usdc.address,
    usdc.address,
    false, // reversed
    marketFactory.address,
    roleStore.address,
    dataStore.address
  );
  const btcUsdMarket = await reader.getMarket(dataStore.address, btcUsdMarketAddress);

  const btcUsdSingleTokenMarketAddress = btcUsdMarketAddress; // Same as btcUsdMarket
  const btcUsdSingleTokenMarket = btcUsdMarket;

  const solUsdMarketAddress = getMarketTokenAddress(
    sol.address,
    usdc.address,
    usdc.address,
    false, // reversed
    marketFactory.address,
    roleStore.address,
    dataStore.address
  );
  const solUsdMarket = await reader.getMarket(dataStore.address, solUsdMarketAddress);

  // Ensure USDC token address is stored
  const currentUsdc = await dataStore.getAddress(keys.USDC);
  if (currentUsdc === hre.ethers.constants.AddressZero) {
    await (
      await config.multicall([config.interface.encodeFunctionData("setAddress", [keys.USDC, "0x", usdc.address])])
    ).wait();
  }

  // Enable SignedPriceProvider as an oracle provider for tests (used for signed oracle prices)
  const signedPriceProvider = await hre.ethers.getContract("SignedPriceProvider");
  const isSignedProviderEnabled = await dataStore.getBool(keys.isOracleProviderEnabledKey(signedPriceProvider.address));
  if (!isSignedProviderEnabled) {
    await dataStore.setBool(keys.isOracleProviderEnabledKey(signedPriceProvider.address), true);
  }

  // Mark SignedPriceProvider as an atomic oracle provider (doesn't require per-token configuration)
  const isSignedProviderAtomic = await dataStore.getBool(keys.isAtomicOracleProviderKey(signedPriceProvider.address));
  if (!isSignedProviderAtomic) {
    await dataStore.setBool(keys.isAtomicOracleProviderKey(signedPriceProvider.address), true);
  }

  // Note: We don't set oracle providers for individual tokens here because:
  // 1. For signed prices (WNT, USDC, WBTC), the SignedPriceProvider is used via the atomic provider mechanism
  // 2. For price feed tokens, the oracle.ts utility sets the provider dynamically during test execution
  // 3. Setting providers here would create conflicts with the dynamic provider assignment in tests

  // const ethUsdGlvAddress = getGlvAddress(
  //   wnt.address,
  //   usdc.address,
  //   ethers.constants.HashZero,
  //   "GMX Liquidity Vault [WETH-USDC]",
  //   "GLV [WETH-USDC]",
  //   glvFactory.address,
  //   roleStore.address,
  //   dataStore.address
  // );

  return {
    accountList,
    getContract: async (contractName) => {
      return await hre.ethers.getContract(contractName);
    },
    accounts: {
      wallet,
      user0,
      user1,
      user2,
      user3,
      user4,
      user5,
      user6,
      user7,
      user8,
      signer0,
      signer1,
      signer2,
      signer3,
      signer4,
      signer5,
      signer6,
      signer7,
      signer8,
      signer9,
      signers: [signer0, signer1, signer2, signer3, signer4, signer5, signer6],
    },
    contracts: {
      config,
      configSyncer,
      mockRiskOracle,
      timelock,
      reader,
      roleStore,
      dataStore,
      depositVault,
      eventEmitter,
      withdrawalVault,
      // shiftVault,
      // oracleStore, // 0xMarket: OracleStore removed
      orderVault,
      marketFactory,
      depositHandler,
      depositUtils,
      executeDepositUtils,
      withdrawalHandler,
      // shiftHandler,
      orderHandler,
      baseOrderUtils,
      orderUtils,
      liquidationHandler,
      adlHandler,
      router,
      exchangeRouter,
      gelatoRelayRouter,
      subaccountGelatoRelayRouter,
      subaccountRouter,
      oracle,
      // gmOracleProvider, // 0xMarket: GmOracleProvider removed
      chainlinkPriceFeedProvider,
      chainlinkDataStreamProvider,
      marketUtils,
      marketStoreUtils,
      depositStoreUtils,
      withdrawalStoreUtils,
      // shiftStoreUtils,
      positionStoreUtils,
      orderStoreUtils,
      decreasePositionUtils,
      increaseOrderUtils,
      increasePositionUtils,
      positionUtils,
      // swapUtils, // MVP: swaps disabled
      referralStorage,
      usdcPriceFeed,
      wethPriceFeed,
      // gmxPriceFeed, // 0xMarket: GMX token not used
      wnt,
      // gmx, // 0xMarket: GMX token not used
      wbtc,
      sol,
      usdc,
      usdt,
      ethUsdMarket,
      ethUsdtMarket,
      ethUsdSpotOnlyMarket,
      ethUsdSingleTokenMarket,
      ethUsdSingleTokenMarket2,
      btcUsdMarket,
      btcUsdSingleTokenMarket,
      solUsdMarket,
      feeHandler,
      // glvFactory,
      // glvHandler,
      // glvVault,
      // glvRouter,
      // ethUsdGlvAddress,
      // glvDepositStoreUtils,
      // glvWithdrawalStoreUtils,
      // glvShiftStoreUtils,
      // glvStoreUtils,
      // glvReader,
      // mockVaultV1,
    },
    props: { oracleSalt, signerIndexes: [0, 1, 2, 3, 4, 5, 6], executionFee: "1000000000000000" },
  };
}

// USDC-only fixture: disables non-USDC markets to ensure tests do not
// accidentally interact with multi-collateral or swap-related paths.
export async function deployUsdcOnlyFixture() {
  const fixture = await deployFixture();
  const {
    dataStore,
    ethUsdMarket,
    ethUsdtMarket,
    ethUsdSpotOnlyMarket,
    ethUsdSingleTokenMarket,
    btcUsdMarket,
    btcUsdSingleTokenMarket,
    solUsdMarket,
    reader,
    referralStorage,
    depositVault,
    withdrawalVault,
    depositHandler,
    withdrawalHandler,
    wnt,
    usdc,
  } = fixture.contracts as any;

  // Disable all markets except the USDC single-token market
  const toDisable = [
    ethUsdMarket,
    ethUsdtMarket,
    ethUsdSpotOnlyMarket,
    btcUsdMarket,
    btcUsdSingleTokenMarket,
    solUsdMarket,
  ].filter(Boolean);

  for (const m of toDisable) {
    await dataStore.setBool(keys.isMarketDisabledKey(m.marketToken), true);
  }

  // Ensure the single-token USDC market is enabled
  await dataStore.setBool(keys.isMarketDisabledKey(ethUsdSingleTokenMarket.marketToken), false);

  // Only expose a minimal whitelist of contracts to USDC-only tests
  const allowedContracts = {
    reader,
    dataStore,
    referralStorage,
    depositVault,
    withdrawalVault,
    depositHandler,
    withdrawalHandler,
    wnt,
    usdc,
    ethUsdSingleTokenMarket,
    ethUsdMarket,
  } as const;

  return {
    ...fixture,
    contracts: allowedContracts as any,
  };
}
