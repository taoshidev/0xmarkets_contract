import hre from "hardhat";
import { grantRoleIfNotGranted } from "../utils/role";

async function main() {
  const keeperAddress = process.env.KEEPER_ADDRESS;
  if (!keeperAddress) {
    throw new Error("KEEPER_ADDRESS env var is required");
  }

  console.log("Granting keeper roles to %s on %s", keeperAddress, hre.network.name);

  await grantRoleIfNotGranted(keeperAddress, "ORDER_KEEPER", "keeper");
  await grantRoleIfNotGranted(keeperAddress, "FROZEN_ORDER_KEEPER", "keeper");
  await grantRoleIfNotGranted(keeperAddress, "LIQUIDATION_KEEPER", "keeper");
  await grantRoleIfNotGranted(keeperAddress, "ADL_KEEPER", "keeper");

  console.log("Done granting keeper roles");
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
