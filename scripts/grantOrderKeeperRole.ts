import hre from "hardhat";
import { hashString } from "../utils/hash";

const { ethers } = hre;

async function main() {
  // The wallet to grant ORDER_KEEPER role to
  const targetWallet = process.env.TARGET_WALLET || "0xe96128886A27067D373ea44B3F3c8f25A182F886";

  console.log("Granting ORDER_KEEPER role to:", targetWallet);

  const roleStore = await ethers.getContract("RoleStore");
  const [signer] = await ethers.getSigners();

  console.log("Signer (must have ROLE_ADMIN):", signer.address);

  const ORDER_KEEPER_ROLE = hashString("ORDER_KEEPER");
  const ROLE_ADMIN = hashString("ROLE_ADMIN");

  // Check if signer has ROLE_ADMIN
  const hasRoleAdmin = await roleStore.hasRole(signer.address, ROLE_ADMIN);
  console.log("Signer has ROLE_ADMIN:", hasRoleAdmin);

  if (!hasRoleAdmin) {
    console.error("Signer does not have ROLE_ADMIN role. Cannot grant roles.");
    console.log("Use the deployer wallet that has ROLE_ADMIN.");
    return;
  }

  // Check if target already has the role
  const alreadyHasRole = await roleStore.hasRole(targetWallet, ORDER_KEEPER_ROLE);
  if (alreadyHasRole) {
    console.log("Target wallet already has ORDER_KEEPER role");
    return;
  }

  // Grant the role
  console.log("Granting ORDER_KEEPER role...");
  const tx = await roleStore.grantRole(targetWallet, ORDER_KEEPER_ROLE);
  console.log("Transaction sent:", tx.hash);
  await tx.wait();
  console.log("Role granted successfully!");

  // Verify
  const hasRole = await roleStore.hasRole(targetWallet, ORDER_KEEPER_ROLE);
  console.log("Verified ORDER_KEEPER role:", hasRole);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
