const { ethers } = require("ethers");
const fs = require("fs");

async function main() {
  const keeperAddress = process.env.KEEPER_ADDRESS;
  const privateKey = process.env.ACCOUNT_KEY;

  if (!keeperAddress) throw new Error("KEEPER_ADDRESS env var is required");
  if (!privateKey) throw new Error("ACCOUNT_KEY env var is required");

  const provider = new ethers.providers.JsonRpcProvider("https://sepolia.base.org");
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("Deployer:", wallet.address);
  console.log("Keeper:", keeperAddress);

  const roleStoreData = JSON.parse(
    fs.readFileSync("deployments/baseSepolia/RoleStore.json", "utf8")
  );
  const roleStore = new ethers.Contract(roleStoreData.address, roleStoreData.abi, wallet);

  function hashString(str) {
    const bytes = ethers.utils.defaultAbiCoder.encode(["string"], [str]);
    return ethers.utils.keccak256(ethers.utils.arrayify(bytes));
  }

  const roles = ["ORDER_KEEPER", "FROZEN_ORDER_KEEPER", "LIQUIDATION_KEEPER", "ADL_KEEPER"];

  for (const role of roles) {
    const roleHash = hashString(role);
    const hasRole = await roleStore.hasRole(keeperAddress, roleHash);

    if (hasRole) {
      console.log(`${role}: already granted`);
    } else {
      console.log(`${role}: granting...`);
      const tx = await roleStore.grantRole(keeperAddress, roleHash);
      console.log(`  tx: ${tx.hash}`);
      await tx.wait();
      console.log(`  confirmed`);
    }
  }

  console.log("Done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
