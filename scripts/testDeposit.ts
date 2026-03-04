import hre from "hardhat";
import { getMarketTokenAddress, DEFAULT_MARKET_TYPE } from "../utils/market";
import { bigNumberify, expandDecimals } from "../utils/math";
import { ExchangeRouter, MintableToken } from "../typechain-types";
import { DepositUtils } from "../typechain-types/contracts/exchange/DepositHandler";

const { ethers } = hre;

async function main() {
  console.log("=== Creating test deposit on baseSepolia ===");

  const marketFactory = await ethers.getContract("MarketFactory");
  const roleStore = await ethers.getContract("RoleStore");
  const dataStore = await ethers.getContract("DataStore");
  const depositVault = await ethers.getContract("DepositVault");
  const exchangeRouter: ExchangeRouter = await ethers.getContract("ExchangeRouter");
  const router = await ethers.getContract("Router");

  // WETH on Base = 0x4200000000000000000000000000000000000006
  const wnt = await ethers.getContractAt("WNT", "0x4200000000000000000000000000000000000006");
  const [wallet] = await ethers.getSigners();

  console.log("Wallet:", wallet.address);
  console.log("Router:", router.address);
  console.log("ExchangeRouter:", exchangeRouter.address);

  const executionFee = expandDecimals(1, 15); // 0.001 ETH

  // Wrap ETH if needed
  const wntBalance = await wnt.balanceOf(wallet.address);
  console.log("WNT balance:", ethers.utils.formatEther(wntBalance));
  if (wntBalance.lt(executionFee)) {
    console.log("Wrapping ETH...");
    await wnt.deposit({ value: executionFee.mul(2) });
  }

  // Approve WNT
  const wntAllowance = await wnt.allowance(wallet.address, router.address);
  if (wntAllowance.lt(executionFee)) {
    console.log("Approving WNT...");
    const approveTx = await wnt.approve(router.address, bigNumberify(2).pow(256).sub(1));
    await approveTx.wait();
  }

  // USDC (mUSDC) at known address
  const usdc: MintableToken = await ethers.getContractAt("MintableToken", "0xFDDFE40Ade3eE9aDE4A2e185C750cf28025BFd6b");
  const shortTokenAmount = expandDecimals(10, 6); // 10 USDC
  console.log("USDC address:", usdc.address);

  const usdcBalance = await usdc.balanceOf(wallet.address);
  console.log("USDC balance:", usdcBalance.toString());
  if (usdcBalance.lt(shortTokenAmount)) {
    console.log("Minting USDC...");
    const mintTx = await usdc.mint(wallet.address, shortTokenAmount);
    await mintTx.wait();
  }

  const usdcAllowance = await usdc.allowance(wallet.address, router.address);
  if (usdcAllowance.lt(shortTokenAmount)) {
    console.log("Approving USDC...");
    const approveTx = await usdc.approve(router.address, bigNumberify(2).pow(256).sub(1));
    await approveTx.wait();
  }

  // WETH/USD market [USDC-USDC] — known address from SDK config
  const wethUsdMarketAddress = "0x41a281111Aa12a968564a33f9293D9B7b0dDFf19";
  console.log("Market:", wethUsdMarketAddress);

  // Create deposit — only short token (USDC) for simplicity
  const params: DepositUtils.CreateDepositParamsStruct = {
    receiver: wallet.address,
    callbackContract: ethers.constants.AddressZero,
    market: wethUsdMarketAddress,
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

  const multicallArgs = [
    exchangeRouter.interface.encodeFunctionData("sendWnt", [depositVault.address, executionFee]),
    exchangeRouter.interface.encodeFunctionData("sendTokens", [usdc.address, depositVault.address, shortTokenAmount]),
    exchangeRouter.interface.encodeFunctionData("sendTokens", [usdc.address, depositVault.address, shortTokenAmount]),
    exchangeRouter.interface.encodeFunctionData("createDeposit", [params]),
  ];

  console.log("\nSubmitting deposit transaction...");
  const tx = await exchangeRouter.multicall(multicallArgs, {
    value: executionFee,
    gasLimit: 2500000,
  });
  console.log("TX hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("TX mined in block:", receipt.blockNumber);
  console.log("Gas used:", receipt.gasUsed.toString());

  // Look for DepositCreated event in logs
  for (const log of receipt.logs) {
    if (log.topics.length > 0) {
      // The EventEmitter emits the events, check for our deposit key
      try {
        // Just print raw topic for identification
        console.log(`  Log: ${log.address} topic0=${log.topics[0].slice(0, 18)}...`);
      } catch {
        /* ignore parsing errors */
      }
    }
  }

  console.log("\n=== Deposit created! Watch keeper logs for execution ===");
  console.log("Run: tail -f /tmp/keeper.log | jq -r '.msg'");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
