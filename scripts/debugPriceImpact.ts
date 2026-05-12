// Run with: npx hardhat run scripts/debugPriceImpact.ts --network baseSepolia
// No forking needed — reads directly from live chain

import { ethers } from "hardhat";

async function main() {
  const READER_ADDRESS = "0x1e6Ca8042e7BC258BBbA35C5C86F013b4eceC03C";
  const DATA_STORE_ADDRESS = "0x3B9d71B497aD2d3c32a7c24e96565f84a58089a7";
  const MARKET_ADDRESS = "0x41a281111Aa12a968564a33f9293D9B7b0dDFf19";
  const USDC_ADDRESS = "0xFDDFE40Ade3eE9aDE4A2e185C750cf28025BFd6b";

  const reader = await ethers.getContractAt("Reader", READER_ADDRESS);
  const dataStore = await ethers.getContractAt("DataStore", DATA_STORE_ADDRESS);

  // ============================================
  // 1. Read market config
  // ============================================
  const market = await reader.getMarket(DATA_STORE_ADDRESS, MARKET_ADDRESS);
  console.log("\n=== MARKET CONFIG ===");
  console.log("marketToken:", market.marketToken);
  console.log("indexToken: ", market.indexToken);
  console.log("longToken:  ", market.longToken);
  console.log("shortToken: ", market.shortToken);
  console.log("sameToken:  ", market.longToken === market.shortToken);

  // ============================================
  // 2. Read raw pool amount from DataStore
  // ============================================
  const poolAmountKey = ethers.utils.solidityKeccak256(
    ["bytes32", "address", "address"],
    [ethers.utils.solidityKeccak256(["string"], ["POOL_AMOUNT"]), MARKET_ADDRESS, USDC_ADDRESS]
  );
  const rawPoolAmount = await dataStore.getUint(poolAmountKey);
  console.log("\n=== POOL STATE ===");
  console.log("raw pool amount (DataStore):", rawPoolAmount.toString());
  console.log("raw pool amount (USDC):", ethers.utils.formatUnits(rawPoolAmount, 6));

  // ============================================
  // 3. Oracle prices from the failed tx trace
  // ============================================
  const prices = {
    indexTokenPrice: {
      min: ethers.BigNumber.from("2044792988770000"),
      max: ethers.BigNumber.from("2044968161350000"),
    },
    longTokenPrice: {
      min: ethers.BigNumber.from("999927650000000000000000"),
      max: ethers.BigNumber.from("1000104990000000000000000"),
    },
    shortTokenPrice: {
      min: ethers.BigNumber.from("999927650000000000000000"),
      max: ethers.BigNumber.from("1000104990000000000000000"),
    },
  };

  const depositAmount = ethers.utils.parseUnits("400000", 6);
  const halfAmount = ethers.utils.parseUnits("200000", 6);

  // ============================================
  // 4. Scenario 1: All on long side (what your tx did)
  // ============================================
  console.log("\n=== SCENARIO 1: 400k long / 0 short ===");
  try {
    const gmOut1 = await reader.getDepositAmountOut(
      DATA_STORE_ADDRESS,
      market,
      prices,
      depositAmount,
      0,
      ethers.constants.AddressZero,
      0,
      true
    );
    console.log("GM tokens out:", gmOut1.toString());
    console.log("GM tokens out (formatted):", ethers.utils.formatEther(gmOut1));
  } catch (e: any) {
    console.log("REVERTED:", e.reason || e.message);
  }

  // ============================================
  // 5. Scenario 2: Split 50/50
  // ============================================
  console.log("\n=== SCENARIO 2: 200k long / 200k short ===");
  try {
    const gmOut2 = await reader.getDepositAmountOut(
      DATA_STORE_ADDRESS,
      market,
      prices,
      halfAmount,
      halfAmount,
      ethers.constants.AddressZero,
      0,
      true
    );
    console.log("GM tokens out:", gmOut2.toString());
    console.log("GM tokens out (formatted):", ethers.utils.formatEther(gmOut2));
  } catch (e: any) {
    console.log("REVERTED:", e.reason || e.message);
  }

  // ============================================
  // 6. Scenario 3: All on short side
  // ============================================
  console.log("\n=== SCENARIO 3: 0 long / 400k short ===");
  try {
    const gmOut3 = await reader.getDepositAmountOut(
      DATA_STORE_ADDRESS,
      market,
      prices,
      0,
      depositAmount,
      ethers.constants.AddressZero,
      0,
      true
    );
    console.log("GM tokens out:", gmOut3.toString());
    console.log("GM tokens out (formatted):", ethers.utils.formatEther(gmOut3));
  } catch (e: any) {
    console.log("REVERTED:", e.reason || e.message);
  }

  // ============================================
  // 7. Direct price impact check
  // ============================================
  console.log("\n=== DIRECT PRICE IMPACT ===");
  try {
    const impact = await reader.getSwapPriceImpact(
      DATA_STORE_ADDRESS,
      market,
      USDC_ADDRESS,
      USDC_ADDRESS,
      depositAmount,
      prices.longTokenPrice,
      prices.shortTokenPrice
    );
    console.log("priceImpactUsdBeforeCap:", impact[0].toString());
    console.log("priceImpactAmount:", impact[1].toString());
  } catch (e: any) {
    console.log("getSwapPriceImpact REVERTED:", e.reason || e.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
