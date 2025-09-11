import hre, { ethers } from "hardhat";

import { deployFixture } from "../utils/fixture";
import { createDeposit, executeDeposit } from "../utils/deposit";
import { createWithdrawal, executeWithdrawal } from "../utils/withdrawal";
import { expandDecimals } from "../utils/math";

async function main() {
  console.log("=== DEX-35 Happy Path (Local) ===");

  // 1) Deploy all contracts to local chain
  await hre.deployments.fixture();

  // 2) Build test fixture view
  const fixture = await deployFixture();
  const { user0 } = fixture.accounts as any;
  const {
    dataStore,
    config,
    reader,
    depositHandler,
    withdrawalHandler,
    depositVault,
    withdrawalVault,
    usdc,
    wnt,
    ethUsdSingleTokenMarket,
  } = fixture.contracts as any;

  console.log("Deployer:", (await ethers.getSigners())[0].address);
  console.log("User0:", user0.address);
  console.log("USDC:", usdc.address);
  console.log("DepositHandler:", depositHandler.address);
  console.log("WithdrawalHandler:", withdrawalHandler.address);
  console.log("DepositVault:", depositVault.address);
  console.log("WithdrawalVault:", withdrawalVault.address);
  console.log("SingleTokenMarket (ETH/USDC/USDC):", ethUsdSingleTokenMarket.marketToken);

  // 3) Mint USDC to user0
  const mintAmount = expandDecimals(10_000, 6);
  await usdc.mint(user0.address, mintAmount);
  const bal0 = await usdc.balanceOf(user0.address);
  console.log("USDC balance (user0) after mint:", bal0.toString());

  // 4) Deposit USDC (create + execute)
  console.log("Creating deposit...");
  await createDeposit(fixture, {
    market: ethUsdSingleTokenMarket,
    initialLongToken: usdc.address,
    initialShortToken: usdc.address,
    longTokenAmount: expandDecimals(1_000, 6),
    shortTokenAmount: 0,
    gasUsageLabel: "createDeposit (happyPath)",
  });
  console.log("Executing deposit...");
  await executeDeposit(fixture, { gasUsageLabel: "executeDeposit (happyPath)" });

  const marketToken = await ethers.getContractAt("MarketToken", ethUsdSingleTokenMarket.marketToken);
  const mtBal = await marketToken.balanceOf(user0.address);
  console.log("MarketToken balance (user0) after deposit:", mtBal.toString());

  // 5) Withdraw half of market tokens (create + execute)
  console.log("Creating withdrawal...");
  await createWithdrawal(fixture, {
    market: ethUsdSingleTokenMarket,
    marketTokenAmount: mtBal.div(2),
    gasUsageLabel: "createWithdrawal (happyPath)",
  });
  console.log("Executing withdrawal...");
  await executeWithdrawal(fixture, { gasUsageLabel: "executeWithdrawal (happyPath)" });

  const bal1 = await usdc.balanceOf(user0.address);
  console.log("USDC balance (user0) after withdrawal:", bal1.toString());

  console.log("=== Happy Path complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
