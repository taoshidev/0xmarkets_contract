import { ethers } from "hardhat";

async function main() {
  const dataStoreAddress = "0xBaD049d5FedE7Bd9022F7E750B982349fE17e83E";

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);
  console.log("Balance:", ethers.utils.formatEther(await signer.getBalance()), "ETH");
  console.log("Nonce:", await signer.getTransactionCount());
  console.log("Pending nonce:", await signer.getTransactionCount("pending"));

  const dataStore = await ethers.getContractAt(
    [
      "function setUint(bytes32 key, uint256 value) external returns (uint256)",
      "function getUint(bytes32 key) external view returns (uint256)",
    ],
    dataStoreAddress,
    signer
  );

  // Compute keys using same hash logic as the deploy script
  function hashData(types: string[], values: any[]): string {
    return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(types, values));
  }
  function hashString(str: string): string {
    return hashData(["string"], [str]);
  }

  const PYTH_LAZER_FEED_ID = hashString("PYTH_LAZER_FEED_ID");
  const PYTH_LAZER_FEED_MULTIPLIER = hashString("PYTH_LAZER_FEED_MULTIPLIER");
  const PYTH_LAZER_FEED_INVERTED = hashString("PYTH_LAZER_FEED_INVERTED");

  // Token configs: [name, address, feedId, tokenDecimals, feedDecimals, inverted]
  const tokens = [
    ["USDC", "0xFDDFE40Ade3eE9aDE4A2e185C750cf28025BFd6b", 7, 6, 8, false],
    ["WETH", "0x4200000000000000000000000000000000000006", 2, 18, 8, false],
    ["WBTC", "0xD8a6E3FCA403d79b6AD6216b60527F51cc967D39", 1, 8, 8, false],
    ["EUR", "0x86e6ab05217318Db4A63f0361BADBf5aF0c69270", 327, 6, 5, false],
    ["GBP", "0x29c46a7d11B6A3051f51a47eE93AAc03a907C81e", 333, 6, 5, false],
    ["GOLD", "0xC2E2d25b96976fC054A5A262e2bc6Fbe8d9bB1e4", 346, 6, 3, false],
    ["JPY", "0x5E45Df87fC8f91D5Bc73B6e75D63742dbE01400A", 340, 6, 3, true],
  ] as const;

  // Check USDC feed ID first
  const usdcFeedKey = hashData(["bytes32", "address"], [PYTH_LAZER_FEED_ID, tokens[0][1]]);
  const currentValue = await dataStore.getUint(usdcFeedKey);
  console.log(`\nCurrent USDC feed ID: ${currentValue}`);

  // Try to set USDC feed ID
  console.log("\nAttempting to set USDC feed ID to 7...");
  try {
    const tx = await signer.sendTransaction({
      to: dataStoreAddress,
      data: dataStore.interface.encodeFunctionData("setUint", [usdcFeedKey, 7]),
      gasLimit: 100000,
    });
    console.log("TX hash:", tx.hash);
    const receipt = await tx.wait(1);
    console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
  } catch (e: any) {
    console.error("Error:", e.message?.substring(0, 200));
  }
}

main().catch(console.error);
