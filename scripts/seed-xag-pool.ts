/**
 * Seed XAG/USD pool with USD0 liquidity.
 * Run: npx hardhat run scripts/seed-xag-pool.ts --network baseSepolia
 */
import { ethers } from "hardhat";

const EXCHANGE_ROUTER = "0x394b791D74E6F2bd803b0Ef10AF9115fE380EA88";
const DEPOSIT_VAULT = "0x590d1d8e50A3a3d9F3448657D1Cb64D486978781";
const ROUTER = "0xE92B08345125dc77eB071d1a2D513751C4D22714";
const XAG_MARKET = "0x6D260c4229dBb55a0a91041b5c07b320fdD6303B";
const USD0 = "0x3ae4474579d24a743c9016F017e76185A834d837";

const DEPOSIT_AMOUNT = ethers.utils.parseUnits("20000", 6); // $20k USD0
const EXECUTION_FEE = ethers.utils.parseEther("0.001");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const usd0 = await ethers.getContractAt("IERC20", USD0);
  const router = await ethers.getContractAt("Router", ROUTER);
  const er = await ethers.getContractAt("ExchangeRouter", EXCHANGE_ROUTER);

  // Check balances
  const usd0Balance = await usd0.balanceOf(deployer.address);
  const ethBalance = await deployer.getBalance();
  console.log("USD0 balance:", ethers.utils.formatUnits(usd0Balance, 6));
  console.log("ETH balance:", ethers.utils.formatEther(ethBalance));

  if (usd0Balance.lt(DEPOSIT_AMOUNT)) {
    console.error("Insufficient USD0 balance. Need", ethers.utils.formatUnits(DEPOSIT_AMOUNT, 6));
    process.exit(1);
  }

  // Approve Router for USD0 if needed
  const allowance = await usd0.allowance(deployer.address, ROUTER);
  if (allowance.lt(DEPOSIT_AMOUNT)) {
    console.log("Approving Router for USD0...");
    const tx = await usd0.approve(ROUTER, ethers.constants.MaxUint256);
    await tx.wait();
    console.log("  Approved");
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Create deposit
  console.log("\nCreating deposit of", ethers.utils.formatUnits(DEPOSIT_AMOUNT, 6), "USD0 into XAG/USD pool...");

  const params = {
    receiver: deployer.address,
    callbackContract: ethers.constants.AddressZero,
    uiFeeReceiver: ethers.constants.AddressZero,
    market: XAG_MARKET,
    initialLongToken: USD0,
    initialShortToken: USD0,
    longTokenSwapPath: [],
    shortTokenSwapPath: [],
    minMarketTokens: 0,
    shouldUnwrapNativeToken: false,
    executionFee: EXECUTION_FEE,
    callbackGasLimit: 0,
  };

  const multicallArgs = [
    er.interface.encodeFunctionData("sendWnt", [DEPOSIT_VAULT, EXECUTION_FEE]),
    er.interface.encodeFunctionData("sendTokens", [USD0, DEPOSIT_VAULT, DEPOSIT_AMOUNT]),
    er.interface.encodeFunctionData("createDeposit", [params]),
  ];

  // Simulate first
  try {
    await er.callStatic.multicall(multicallArgs, { value: EXECUTION_FEE });
    console.log("  Simulation passed ✓");
  } catch (e: any) {
    console.error("  Simulation failed ✗:", (e.reason || e.message).substring(0, 200));
    process.exit(1);
  }

  // Execute
  const tx = await er.multicall(multicallArgs, { value: EXECUTION_FEE, gasLimit: 2500000 });
  console.log("  tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("  confirmed, gas used:", receipt.gasUsed.toString());

  console.log("\nDeposit created. The keeper will execute it to add liquidity to the pool.");
  console.log("Market:", XAG_MARKET);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
