import hre from "hardhat";
import { bigNumberify, expandDecimals } from "../utils/math";
import { ExchangeRouter, MintableToken } from "../typechain-types";
import { DepositUtils } from "../typechain-types/contracts/exchange/DepositHandler";
import { IBaseOrderUtils } from "../typechain-types/contracts/router/ExchangeRouter";

const { ethers } = hre;

const MARKETS = {
  "WETH/USD": "0x41a281111Aa12a968564a33f9293D9B7b0dDFf19",
  "WBTC/USD": "0x3c3D358701B4df855b3B88D4c840f694c9db8324",
  "EUR/USD": "0xd3c882AbD5854267d509b944429faA82f3d36088",
  "GBP/USD": "0x981977239025C8F2E133f87b79bEcc587B0e7562",
  "GOLD/USD": "0xf008E4b0962Bf5907d7dB11e88C9EA423D4e2563",
  "JPY/USD": "0xF28b8572AD4c0BfF5EdfB6579b1Fa6fF0A9Eef5A",
};

const USDC_ADDRESS = "0xFDDFE40Ade3eE9aDE4A2e185C750cf28025BFd6b";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

type TestMode = "deposit" | "order" | "withdrawal";

async function main() {
  const mode = (process.env.TEST_MODE || "deposit") as TestMode;
  const marketFilter = process.env.MARKET; // optional: "WETH/USD" etc

  console.log(`\n=== E2E Test: ${mode.toUpperCase()} ===`);
  console.log(`Markets: ${marketFilter || "ALL"}\n`);

  const depositVault = await ethers.getContract("DepositVault");
  const orderVault = await ethers.getContract("OrderVault");
  const withdrawalVault = await ethers.getContract("WithdrawalVault");
  const exchangeRouter: ExchangeRouter = await ethers.getContract("ExchangeRouter");
  const router = await ethers.getContract("Router");
  const wnt = await ethers.getContractAt("WNT", WETH_ADDRESS);
  const usdc: MintableToken = await ethers.getContractAt("MintableToken", USDC_ADDRESS);
  const [wallet] = await ethers.getSigners();

  console.log("Wallet:", wallet.address);

  const executionFee = expandDecimals(1, 15); // 0.001 ETH

  // Ensure approvals
  const maxUint = bigNumberify(2).pow(256).sub(1);
  const wntAllowance = await wnt.allowance(wallet.address, router.address);
  if (wntAllowance.lt(expandDecimals(1, 18))) {
    console.log("Approving WNT...");
    await (await wnt.approve(router.address, maxUint)).wait();
  }
  const usdcAllowance = await usdc.allowance(wallet.address, router.address);
  if (usdcAllowance.lt(expandDecimals(1000, 6))) {
    console.log("Approving USDC...");
    await (await usdc.approve(router.address, maxUint)).wait();
  }

  // Mint USDC if needed
  const usdcBalance = await usdc.balanceOf(wallet.address);
  const needed = expandDecimals(200, 6); // 200 USDC total for all tests
  if (usdcBalance.lt(needed)) {
    console.log("Minting USDC...");
    await (await usdc.mint(wallet.address, needed)).wait();
  }

  // Check ETH balance
  const ethBalance = await wallet.getBalance();
  console.log(`ETH balance: ${ethers.utils.formatEther(ethBalance)}`);
  console.log(`USDC balance: ${ethers.utils.formatUnits(await usdc.balanceOf(wallet.address), 6)}`);
  console.log(`WNT balance: ${ethers.utils.formatEther(await wnt.balanceOf(wallet.address))}\n`);

  const entries = Object.entries(MARKETS).filter(([name]) => !marketFilter || name === marketFilter);

  const results: { market: string; status: string; txHash?: string }[] = [];

  for (let i = 0; i < entries.length; i++) {
    const [name, address] = entries[i];
    try {
      let txHash: string;

      if (mode === "deposit") {
        txHash = await testDeposit(exchangeRouter, depositVault, usdc, wnt, wallet, address, name, executionFee);
      } else if (mode === "order") {
        txHash = await testOrder(exchangeRouter, orderVault, usdc, wnt, wallet, address, name, executionFee);
      } else {
        txHash = await testWithdrawal(exchangeRouter, withdrawalVault, wnt, wallet, address, name, executionFee);
      }

      results.push({ market: name, status: "SUBMITTED", txHash });

      // Wait for nonce to propagate between txs
      if (i < entries.length - 1) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (err: any) {
      console.error(`  FAILED: ${err.message?.slice(0, 120)}`);
      results.push({ market: name, status: "FAILED" });
    }
  }

  console.log("\n=== Results ===");
  for (const r of results) {
    const hash = r.txHash ? ` tx: ${r.txHash}` : "";
    console.log(`  ${r.market}: ${r.status}${hash}`);
  }
  console.log("\nWatch keeper: tail -f /tmp/keeper.log | grep 'tx confirmed'");
}

async function testDeposit(
  exchangeRouter: ExchangeRouter,
  depositVault: any,
  usdc: MintableToken,
  wnt: any,
  wallet: any,
  marketAddress: string,
  marketName: string,
  executionFee: any
): Promise<string> {
  const shortTokenAmount = expandDecimals(10, 6); // 10 USDC per market
  console.log(`[${marketName}] Creating deposit of 20 USDC (10+10) into ${marketAddress.slice(0, 10)}...`);

  const params: DepositUtils.CreateDepositParamsStruct = {
    receiver: wallet.address,
    callbackContract: ethers.constants.AddressZero,
    market: marketAddress,
    minMarketTokens: 0,
    shouldUnwrapNativeToken: false,
    executionFee,
    callbackGasLimit: 0,
    initialLongToken: usdc.address,
    initialShortToken: usdc.address,
    longTokenSwapPath: [],
    shortTokenSwapPath: [],
    uiFeeReceiver: ethers.constants.AddressZero,
  };

  const multicallArgs = [
    exchangeRouter.interface.encodeFunctionData("sendWnt", [depositVault.address, executionFee]),
    exchangeRouter.interface.encodeFunctionData("sendTokens", [usdc.address, depositVault.address, shortTokenAmount]),
    exchangeRouter.interface.encodeFunctionData("sendTokens", [usdc.address, depositVault.address, shortTokenAmount]),
    exchangeRouter.interface.encodeFunctionData("createDeposit", [params]),
  ];

  // Simulate first to catch revert reasons
  try {
    await exchangeRouter.callStatic.multicall(multicallArgs, {
      value: executionFee,
      gasLimit: 2500000,
    });
  } catch (simErr: any) {
    console.error(`  [${marketName}] Simulation REVERTED: ${simErr.reason || simErr.message?.slice(0, 200)}`);
    throw simErr;
  }

  const tx = await exchangeRouter.multicall(multicallArgs, {
    value: executionFee,
    gasLimit: 2500000,
  });
  const receipt = await tx.wait();
  console.log(`  [${marketName}] Deposit TX mined: ${tx.hash} (block ${receipt.blockNumber})`);
  return tx.hash;
}

async function testOrder(
  exchangeRouter: ExchangeRouter,
  orderVault: any,
  usdc: MintableToken,
  wnt: any,
  wallet: any,
  marketAddress: string,
  marketName: string,
  executionFee: any
): Promise<string> {
  const collateralAmount = expandDecimals(5, 6); // 5 USDC collateral
  // sizeDeltaUsd = 10 USD (with 30 decimals as per contract)
  const sizeDeltaUsd = expandDecimals(10, 30);

  console.log(`[${marketName}] Creating MarketIncrease long order, 5 USDC collateral, $10 size...`);

  const params: IBaseOrderUtils.CreateOrderParamsStruct = {
    addresses: {
      receiver: wallet.address,
      cancellationReceiver: ethers.constants.AddressZero,
      uiFeeReceiver: ethers.constants.AddressZero,
      callbackContract: ethers.constants.AddressZero,
      market: marketAddress,
      initialCollateralToken: usdc.address,
      swapPath: [],
    },
    numbers: {
      sizeDeltaUsd,
      triggerPrice: 0,
      acceptablePrice: ethers.constants.MaxUint256, // any price for market order
      executionFee,
      callbackGasLimit: 0,
      minOutputAmount: 0,
      initialCollateralDeltaAmount: 0,
      validFromTime: 0,
    },
    orderType: 2, // MarketIncrease
    isLong: true,
    shouldUnwrapNativeToken: false,
    decreasePositionSwapType: 0,
    autoCancel: false,
    referralCode: ethers.constants.HashZero,
  };

  const multicallArgs = [
    exchangeRouter.interface.encodeFunctionData("sendWnt", [orderVault.address, executionFee]),
    exchangeRouter.interface.encodeFunctionData("sendTokens", [usdc.address, orderVault.address, collateralAmount]),
    exchangeRouter.interface.encodeFunctionData("createOrder", [params]),
  ];

  const tx = await exchangeRouter.multicall(multicallArgs, {
    value: executionFee,
    gasLimit: 2500000,
  });
  const receipt = await tx.wait();
  console.log(`  [${marketName}] Order TX mined: ${tx.hash} (block ${receipt.blockNumber})`);
  return tx.hash;
}

async function testWithdrawal(
  exchangeRouter: ExchangeRouter,
  withdrawalVault: any,
  wnt: any,
  wallet: any,
  marketAddress: string,
  marketName: string,
  executionFee: any
): Promise<string> {
  // Check market token balance
  const marketToken = await ethers.getContractAt("MintableToken", marketAddress);
  const balance = await marketToken.balanceOf(wallet.address);
  console.log(`[${marketName}] Market token balance: ${balance.toString()}`);

  if (balance.eq(0)) {
    throw new Error("No market tokens to withdraw - deposit first");
  }

  // Withdraw half of balance (or all if small)
  const withdrawAmount = balance.div(2).gt(0) ? balance.div(2) : balance;

  // Approve market token
  const router = await ethers.getContract("Router");
  const allowance = await marketToken.allowance(wallet.address, router.address);
  if (allowance.lt(withdrawAmount)) {
    console.log(`  Approving market token...`);
    await (await marketToken.approve(router.address, ethers.constants.MaxUint256)).wait();
  }

  console.log(`[${marketName}] Creating withdrawal of ${withdrawAmount.toString()} market tokens...`);

  const params = {
    receiver: wallet.address,
    callbackContract: ethers.constants.AddressZero,
    market: marketAddress,
    minLongTokenAmount: 0,
    minShortTokenAmount: 0,
    shouldUnwrapNativeToken: false,
    executionFee,
    callbackGasLimit: 0,
    uiFeeReceiver: ethers.constants.AddressZero,
    longTokenSwapPath: [],
    shortTokenSwapPath: [],
  };

  const multicallArgs = [
    exchangeRouter.interface.encodeFunctionData("sendWnt", [withdrawalVault.address, executionFee]),
    exchangeRouter.interface.encodeFunctionData("sendTokens", [marketAddress, withdrawalVault.address, withdrawAmount]),
    exchangeRouter.interface.encodeFunctionData("createWithdrawal", [params]),
  ];

  const tx = await exchangeRouter.multicall(multicallArgs, {
    value: executionFee,
    gasLimit: 2500000,
  });
  const receipt = await tx.wait();
  console.log(`  [${marketName}] Withdrawal TX mined: ${tx.hash} (block ${receipt.blockNumber})`);
  return tx.hash;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
