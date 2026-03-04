import hre from "hardhat";
import { ethers } from "ethers";

/**
 * Deploy PythLazerFeedProvider v2 (uses verifyUpdate instead of verifyAndParseUpdate)
 * Then update DataStore for all 7 tokens, enable the provider, and fund it.
 */
async function main() {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const signer = (await hre.ethers.getSigners())[0];

  // IMPORTANT: This is the DataStore used by deployed Oracle/DepositHandler/OrderHandler.
  // Do NOT use 0xBaD049d5... — that is a different DataStore not referenced by live contracts.
  const DATASTORE = "0x3B9d71B497aD2d3c32a7c24e96565f84a58089a7";
  const PYTH_LAZER_VERIFIER = "0xACeA761c27A909d4D3895128EBe6370FDE2dF481";
  const PYTH_LAZER_LIB = "0x0E916868cC97181180846881096B3994820D9778";

  const TOKENS = [
    { symbol: "EUR", address: "0x86e6ab05217318Db4A63f0361BADBf5aF0c69270" },
    { symbol: "GBP", address: "0x29c46a7d11B6A3051f51a47eE93AAc03a907C81e" },
    { symbol: "GOLD", address: "0xC2E2d25b96976fC054A5A262e2bc6Fbe8d9bB1e4" },
    { symbol: "JPY", address: "0x5E45Df87fC8f91D5Bc73B6e75D63742dbE01400A" },
    { symbol: "USDC", address: "0xFDDFE40Ade3eE9aDE4A2e185C750cf28025BFd6b" },
    { symbol: "WBTC", address: "0xD8a6E3FCA403d79b6AD6216b60527F51cc967D39" },
    { symbol: "WETH", address: "0x4200000000000000000000000000000000000006" },
  ];

  // --- Step 1: Deploy new PythLazerFeedProvider ---
  console.log("\n=== Step 1: Deploy PythLazerFeedProvider ===");

  const factory = await hre.ethers.getContractFactory("PythLazerFeedProvider", {
    libraries: { PythLazerLib: PYTH_LAZER_LIB },
  });
  const provider = await factory.deploy(DATASTORE, PYTH_LAZER_VERIFIER);
  await provider.deployed();
  console.log(`Deployed at: ${provider.address}`);

  // --- Step 2: Verify contract responds ---
  console.log("\n=== Step 2: Verify contract responds ===");
  const ds = await provider.dataStore();
  const pl = await provider.pythLazer();
  console.log(`  dataStore: ${ds} (expected ${DATASTORE})`);
  console.log(`  pythLazer: ${pl} (expected ${PYTH_LAZER_VERIFIER})`);
  if (ds.toLowerCase() !== DATASTORE.toLowerCase() || pl.toLowerCase() !== PYTH_LAZER_VERIFIER.toLowerCase()) {
    throw new Error("Constructor params mismatch!");
  }
  console.log("  OK");

  // --- Step 3: Update DataStore ORACLE_PROVIDER_FOR_TOKEN for all tokens ---
  console.log("\n=== Step 3: Update DataStore oracle provider for all tokens ===");
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

  for (const token of TOKENS) {
    // Key: keccak256(abi.encode(keccak256(abi.encode("ORACLE_PROVIDER_FOR_TOKEN")), token.address))
    const baseKey = hre.ethers.utils.keccak256(
      hre.ethers.utils.defaultAbiCoder.encode(["string"], ["ORACLE_PROVIDER_FOR_TOKEN"])
    );
    const key = hre.ethers.utils.keccak256(
      hre.ethers.utils.defaultAbiCoder.encode(["bytes32", "address"], [baseKey, token.address])
    );

    const tx = await dataStore.setAddress(key, provider.address);
    await tx.wait();

    // Verify
    const stored = await dataStore.getAddress(key);
    if (stored.toLowerCase() !== provider.address.toLowerCase()) {
      throw new Error(`DataStore update failed for ${token.symbol}: got ${stored}`);
    }
    console.log(`  ${token.symbol}: OK`);
  }

  // --- Step 4: Enable the provider ---
  console.log("\n=== Step 4: Enable oracle provider ===");
  const enableKey = hre.ethers.utils.keccak256(
    hre.ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "address"],
      [
        hre.ethers.utils.keccak256(hre.ethers.utils.defaultAbiCoder.encode(["string"], ["IS_ORACLE_PROVIDER_ENABLED"])),
        provider.address,
      ]
    )
  );
  const enableTx = await dataStore.setBool(enableKey, true);
  await enableTx.wait();
  const isEnabled = await dataStore.getBool(enableKey);
  console.log(`  IS_ORACLE_PROVIDER_ENABLED: ${isEnabled}`);
  if (!isEnabled) throw new Error("Failed to enable provider!");

  // --- Step 5: Fund the provider with ETH for verification fees ---
  console.log("\n=== Step 5: Fund provider with ETH ===");
  const fundTx = await signer.sendTransaction({
    to: provider.address,
    value: hre.ethers.utils.parseEther("0.001"),
  });
  await fundTx.wait();
  const balance = await hre.ethers.provider.getBalance(provider.address);
  console.log(`  Balance: ${hre.ethers.utils.formatEther(balance)} ETH`);

  // --- Step 6: Verify with a direct call test ---
  console.log(
    "\n=== Step 6: Smoke test - call getOraclePrice with dummy data (expect revert with input too short) ==="
  );
  try {
    await provider.callStatic.getOraclePrice(TOKENS[6].address, "0x00");
    console.log("  WARNING: call did not revert (unexpected)");
  } catch (err: any) {
    const msg = err.message || String(err);
    if (msg.includes("input too short")) {
      console.log("  PASS: revert with 'input too short' — verifyUpdate is being called correctly");
    } else if (msg.includes("revert")) {
      console.log(`  Reverted with: ${msg.slice(0, 200)}`);
      console.log("  (This is expected — we passed dummy data)");
    } else {
      console.log(`  Error: ${msg.slice(0, 200)}`);
    }
  }

  // --- Summary ---
  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log(`New PythLazerFeedProvider: ${provider.address}`);
  console.log(`\nUpdate keeper .env:`);
  console.log(`  PYTH_LAZER_FEED_PROVIDER_ADDRESS="${provider.address}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
