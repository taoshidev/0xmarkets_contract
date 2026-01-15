import hre from "hardhat";

import { getMarketTokenAddress, DEFAULT_MARKET_TYPE } from "../utils/market";
import { bigNumberify, expandDecimals } from "../utils/math";
import * as keys from "../utils/keys";

import { WNT, ExchangeRouter, MintableToken } from "../typechain-types";
import { DepositUtils } from "../typechain-types/contracts/exchange/DepositHandler";

const { ethers } = hre;

async function getValues(): Promise<{
  wnt: WNT;
  usdcAddress: string;
}> {
  if (hre.network.name === "baseSepolia") {
    // Native WETH on Base Sepolia for execution fees (supports deposit())
    const nativeWethAddress = "0x4200000000000000000000000000000000000006";
    return {
      wnt: await ethers.getContractAt("WNT", nativeWethAddress),
      usdcAddress: "0xA36a6765cc50b1F4678fA91770dcfCf48727730F",
    };
  } else if (hre.network.name === "localhost") {
    return {
      wnt: await ethers.getContract("WETH"),
      usdcAddress: "",
    };
  }

  throw new Error("unsupported network");
}

async function main() {
  console.log("run createDepositEurUsdc");
  const marketFactory = await ethers.getContract("MarketFactory");
  const roleStore = await ethers.getContract("RoleStore");
  const dataStore = await ethers.getContract("DataStore");
  const depositVault = await ethers.getContract("DepositVault");
  const exchangeRouter: ExchangeRouter = await ethers.getContract("ExchangeRouter");
  const router = await ethers.getContract("Router");

  const { wnt, usdcAddress } = await getValues();

  const [wallet] = await ethers.getSigners();

  // Get EUR token address from DataStore (it's an asset token)
  const eurTokenAddress = await dataStore.getAddress(keys.assetTokenKey("EUR"));
  console.log("EUR token address %s", eurTokenAddress);

  const executionFee = expandDecimals(1, 15); // 0.001 WNT
  if ((await wnt.balanceOf(wallet.address)).lt(executionFee)) {
    console.log("depositing %s WNT", executionFee.toString());
    await wnt.deposit({ value: executionFee });
  }

  const wntAllowance = await wnt.allowance(wallet.address, router.address);
  console.log("WNT address %s symbol %s", wnt.address, await wnt.symbol());
  console.log("WNT allowance %s", wntAllowance.toString());
  if (wntAllowance.lt(executionFee)) {
    console.log("approving WNT");
    await wnt.approve(router.address, bigNumberify(2).pow(256).sub(1));
  }
  console.log("WNT balance %s", await wnt.balanceOf(wallet.address));

  // Load USDC - use address for baseSepolia, getContract for other networks
  const usdc: MintableToken = usdcAddress
    ? await ethers.getContractAt("MintableToken", usdcAddress)
    : await ethers.getContract("USDC");

  // For EUR/USDC/USDC market, both long and short tokens are USDC
  // We'll deposit 10 USDC for long side and 10 USDC for short side (small test amount)
  const longTokenAmount = expandDecimals(10, 6); // 10 USDC
  const shortTokenAmount = expandDecimals(10, 6); // 10 USDC
  const totalUsdcNeeded = longTokenAmount.add(shortTokenAmount);

  const usdcAllowance = await usdc.allowance(wallet.address, router.address);
  console.log("USDC address %s", usdc.address);
  console.log("USDC allowance %s", usdcAllowance.toString());
  if (usdcAllowance.lt(totalUsdcNeeded)) {
    console.log("approving USDC");
    await usdc.approve(router.address, bigNumberify(2).pow(256).sub(1));
  }
  const usdcBalance = await usdc.balanceOf(wallet.address);
  console.log("USDC balance %s", usdcBalance);
  if (usdcBalance.lt(totalUsdcNeeded)) {
    console.log("minting %s USDC", totalUsdcNeeded);
    await usdc.mint(wallet.address, totalUsdcNeeded);
  }

  // EUR/USDC/USDC market: indexToken=EUR, longToken=USDC, shortToken=USDC
  const eurUsdcMarketAddress = await getMarketTokenAddress(
    eurTokenAddress,
    usdc.address,
    usdc.address,
    DEFAULT_MARKET_TYPE,
    false, // not reversed
    marketFactory.address,
    roleStore.address,
    dataStore.address
  );
  console.log("EUR/USDC market %s", eurUsdcMarketAddress);

  const params: DepositUtils.CreateDepositParamsStruct = {
    receiver: wallet.address,
    callbackContract: ethers.constants.AddressZero,
    market: eurUsdcMarketAddress,
    minMarketTokens: 0,
    shouldUnwrapNativeToken: false,
    executionFee: executionFee,
    callbackGasLimit: 0,
    initialLongToken: usdc.address,
    longTokenSwapPath: [],
    initialShortToken: usdc.address,
    shortTokenSwapPath: [],
    uiFeeReceiver: ethers.constants.AddressZero,
  };
  console.log("exchange router %s", exchangeRouter.address);
  console.log("deposit vault %s", depositVault.address);
  console.log("creating deposit %s", JSON.stringify(params));

  const multicallArgs = [
    exchangeRouter.interface.encodeFunctionData("sendWnt", [depositVault.address, executionFee]),
    exchangeRouter.interface.encodeFunctionData("sendTokens", [usdc.address, depositVault.address, longTokenAmount]),
    exchangeRouter.interface.encodeFunctionData("sendTokens", [usdc.address, depositVault.address, shortTokenAmount]),
    exchangeRouter.interface.encodeFunctionData("createDeposit", [params]),
  ];
  console.log("multicall args", multicallArgs);

  const tx = await exchangeRouter.multicall(multicallArgs, {
    value: executionFee,
    gasLimit: 2500000,
  });

  console.log("transaction sent", tx.hash);
  await tx.wait();
  console.log("receipt received");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
