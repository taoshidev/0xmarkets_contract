import hre from "hardhat";

async function main() {
  const signer = (await hre.ethers.getSigners())[0];
  const PROVIDER = "0xc5810FC1932e44866bD0D041FbfB08d8AC2A67d6";
  // IMPORTANT: This is the DataStore used by deployed Oracle/DepositHandler/OrderHandler.
  // Do NOT use 0xBaD049d5... — that is a different DataStore not referenced by live contracts.
  const DATASTORE = "0x3B9d71B497aD2d3c32a7c24e96565f84a58089a7";

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

  // --- Fund provider ---
  console.log("\n=== Funding provider with 0.001 ETH ===");
  const fundTx = await signer.sendTransaction({
    to: PROVIDER,
    value: hre.ethers.utils.parseEther("0.001"),
  });
  await fundTx.wait();
  const balance = await hre.ethers.provider.getBalance(PROVIDER);
  console.log(`  Balance: ${hre.ethers.utils.formatEther(balance)} ETH`);

  console.log("\n=== DONE ===");
  console.log(`Provider: ${PROVIDER}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
