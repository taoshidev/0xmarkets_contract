import hre from "hardhat";
import { hashString } from "../utils/hash";

async function main() {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log(`[liq-upgrade] deployer=${deployer} network=${hre.network.name}`);

  const libAddrs = async (names: string[]) => {
    const m: Record<string, string> = {};
    for (const n of names) m[n] = (await get(n)).address;
    return m;
  };

  const deployLib = async (name: string, libraryNames: string[] = []) => {
    const libraries = libraryNames.length ? await libAddrs(libraryNames) : undefined;
    const d = await deploy(name, { from: deployer, log: true, libraries });
    console.log(`[liq-upgrade] ${name} -> ${d.address}`);
    return d.address;
  };

  await deployLib("PositionEventUtils");
  await deployLib("MarketUtils", ["MarketEventUtils", "MarketStoreUtils"]);
  await deployLib("PositionUtils", ["MarketStoreUtils", "MarketUtils", "PositionPricingUtils"]);
  await deployLib("DecreasePositionCollateralUtils", [
    "BaseOrderUtils",
    "FeeUtils",
    "MarketCollateralUtils",
    "MarketEventUtils",
    "PositionUtils",
    "PositionPricingUtils",
    "PositionEventUtils",
    "OrderEventUtils",
    "DecreasePositionSwapUtils",
  ]);
  await deployLib("DecreasePositionUtils", [
    "MarketCollateralUtils",
    "MarketUtils",
    "MarketEventUtils",
    "PositionUtils",
    "PositionStoreUtils",
    "PositionEventUtils",
    "OrderEventUtils",
    "PositionPricingUtils",
    "ReferralEventUtils",
    "DecreasePositionCollateralUtils",
    "DecreasePositionSwapUtils",
  ]);
  await deployLib("LiquidationUtils", ["PositionStoreUtils", "OrderStoreUtils", "OrderEventUtils"]);

  const envAddr = (k: string): string => {
    const v = process.env[k];
    if (!v || !v.startsWith("0x") || v.length !== 42) {
      throw new Error(`[liq-upgrade] ${k} env var missing/invalid: ${v}`);
    }
    return v;
  };
  const args = [
    envAddr("OXM_ROLE_STORE"),
    envAddr("OXM_DATA_STORE"),
    envAddr("OXM_EVENT_EMITTER"),
    envAddr("OXM_ORACLE"),
    envAddr("OXM_ORDER_VAULT"),
    envAddr("OXM_SWAP_HANDLER"),
    envAddr("OXM_REFERRAL_STORAGE"),
  ];

  const lhLibs = await libAddrs([
    "OrderUtils",
    "ExecuteOrderUtils",
    "LiquidationUtils",
    "MarketStoreUtils",
    "PositionStoreUtils",
    "OrderStoreUtils",
  ]);
  const lh = await deploy("LiquidationHandler", {
    from: deployer,
    log: true,
    args,
    libraries: lhLibs,
  });
  console.log(`[liq-upgrade] LiquidationHandler -> ${lh.address}`);

  const roleStore = await ethers.getContractAt(
    ["function grantRole(address,bytes32)", "function hasRole(address,bytes32) view returns (bool)"],
    envAddr("OXM_ROLE_STORE")
  );
  const controllerHash = hashString("CONTROLLER");
  const hasRole = await roleStore.hasRole(lh.address, controllerHash);
  if (!hasRole) {
    const signer = await ethers.getSigner(deployer);
    const tx = await roleStore.connect(signer).grantRole(lh.address, controllerHash);
    await tx.wait();
    console.log(`[liq-upgrade] granted CONTROLLER to ${lh.address}`);
  } else {
    console.log(`[liq-upgrade] CONTROLLER already granted to ${lh.address}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
