import hre from "hardhat";

/**
 * Configure the already-deployed PythLazerFeedProvider v2 at 0xf6ef...
 * Update DataStore, enable provider, fund with ETH.
 */
async function main() {
  const signer = (await hre.ethers.getSigners())[0];
  const PROVIDER = "0xc5810FC1932e44866bD0D041FbfB08d8AC2A67d6";
  // IMPORTANT: This is the DataStore used by deployed Oracle/DepositHandler/OrderHandler.
  // Do NOT use 0xBaD049d5... — that is a different DataStore not referenced by live contracts.
  const DATASTORE = "0x3B9d71B497aD2d3c32a7c24e96565f84a58089a7";

  const TOKENS = [
    { symbol: "EUR", address: "0x86e6ab05217318Db4A63f0361BADBf5aF0c69270" },
    { symbol: "GBP", address: "0x29c46a7d11B6A3051f51a47eE93AAc03a907C81e" },
    { symbol: "GOLD", address: "0xC2E2d25b96976fC054A5A262e2bc6Fbe8d9bB1e4" },
    { symbol: "JPY", address: "0x5E45Df87fC8f91D5Bc73B6e75D63742dbE01400A" },
    { symbol: "USDC", address: "0xFDDFE40Ade3eE9aDE4A2e185C750cf28025BFd6b" },
    { symbol: "WBTC", address: "0xD8a6E3FCA403d79b6AD6216b60527F51cc967D39" },
    { symbol: "WETH", address: "0x4200000000000000000000000000000000000006" },
  ];

  const dataStore = new hre.ethers.Contract(
    DATASTORE,
    [
      "function setAddress(bytes32 key, address value) external",
      "function getAddress(bytes32 key) external view returns (address)",
      "function setBool(bytes32 key, bool value) external",
      "function getBool(bytes32 key) external view returns (bool)",
    ],
    signer
  );

  // --- Update oracle provider for all tokens ---
  console.log("=== Updating ORACLE_PROVIDER_FOR_TOKEN ===");
  for (const token of TOKENS) {
    const baseKey = hre.ethers.utils.keccak256(
      hre.ethers.utils.defaultAbiCoder.encode(["string"], ["ORACLE_PROVIDER_FOR_TOKEN"])
    );
    const key = hre.ethers.utils.keccak256(
      hre.ethers.utils.defaultAbiCoder.encode(["bytes32", "address"], [baseKey, token.address])
    );
    const tx = await dataStore.setAddress(key, PROVIDER);
    await tx.wait();
    const stored = await dataStore.getAddress(key);
    const ok = stored.toLowerCase() === PROVIDER.toLowerCase();
    console.log(`  ${token.symbol}: ${ok ? "OK" : "FAIL (" + stored + ")"}`);
    if (!ok) throw new Error(`Failed for ${token.symbol}`);
  }

  // --- Enable provider ---
  console.log("\n=== Enabling oracle provider ===");
  const enableBaseKey = hre.ethers.utils.keccak256(
    hre.ethers.utils.defaultAbiCoder.encode(["string"], ["IS_ORACLE_PROVIDER_ENABLED"])
  );
  const enableKey = hre.ethers.utils.keccak256(
    hre.ethers.utils.defaultAbiCoder.encode(["bytes32", "address"], [enableBaseKey, PROVIDER])
  );
  const enableTx = await dataStore.setBool(enableKey, true);
  await enableTx.wait();
  const isEnabled = await dataStore.getBool(enableKey);
  console.log(`  Enabled: ${isEnabled}`);
  if (!isEnabled) throw new Error("Enable failed");

  // --- Fund provider ---
  console.log("\n=== Funding provider with 0.001 ETH ===");
  const fundTx = await signer.sendTransaction({
    to: PROVIDER,
    value: hre.ethers.utils.parseEther("0.001"),
  });
  await fundTx.wait();
  const balance = await hre.ethers.provider.getBalance(PROVIDER);
  console.log(`  Balance: ${hre.ethers.utils.formatEther(balance)} ETH`);

  console.log("\n=== CONFIGURATION COMPLETE ===");
  console.log(`Provider: ${PROVIDER}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
