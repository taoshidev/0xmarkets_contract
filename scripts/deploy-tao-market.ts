/**
 * Configure TAO (Bittensor) Pyth feed and create market.
 * TAO is a synthetic token — address is derived deterministically from chainId + symbol.
 *
 * Run: npx hardhat run scripts/deploy-tao-market.ts --network baseSepolia
 */
import { ethers } from "hardhat";
import * as Keys from "../utils/keys";
import { getSyntheticTokenAddress } from "../utils/token";

const INFRA = {
  DataStore: "0x0cA7D71845cb485B7593bBdCbcac93d82d52d053",
  RoleStore: "0xa5fCcD8Eba314B08cF6f637C390f78693Eb1289C",
  MarketFactory: "0x60418A0f55d73b086530C9CFDA3cd7bc47a68a66",
  USD0: "0x3ae4474579d24a743c9016F017e76185A834d837",
};

// Correct role key encoding
const CONTROLLER = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["CONTROLLER"]));
const MARKET_KEEPER = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["MARKET_KEEPER"]));

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const chainId = (await ethers.provider.getNetwork()).chainId;
  const TAO_TOKEN = getSyntheticTokenAddress(chainId, "TAO");
  console.log("TAO synthetic token address:", TAO_TOKEN);

  const dataStore = await ethers.getContractAt("DataStore", INFRA.DataStore);
  const roleStore = await ethers.getContractAt("RoleStore", INFRA.RoleStore);

  // --- 1. Configure Pyth Lazer feed ---
  console.log("\n--- Configuring Pyth Lazer feed for TAO ---");

  const FEED_ID = 36;
  const FEED_DECIMALS = 8;
  const TOKEN_DECIMALS = 18;
  // feedMultiplier: 10^(60 - tokenDecimals - feedDecimals) = 10^(60-18-8) = 10^34
  const feedMultiplier = ethers.BigNumber.from(10).pow(60 - TOKEN_DECIMALS - FEED_DECIMALS);

  const currentFeedId = await dataStore.getUint(Keys.pythLazerFeedIdKey(TAO_TOKEN));
  if (currentFeedId.eq(FEED_ID)) {
    console.log(`  feedId already set to ${FEED_ID}`);
  } else {
    const tx = await dataStore.setUint(Keys.pythLazerFeedIdKey(TAO_TOKEN), FEED_ID);
    await tx.wait();
    console.log(`  feedId set to ${FEED_ID}`);
    await new Promise((r) => setTimeout(r, 3000));
  }

  const currentMultiplier = await dataStore.getUint(Keys.pythLazerFeedMultiplierKey(TAO_TOKEN));
  if (currentMultiplier.eq(feedMultiplier)) {
    console.log(`  feedMultiplier already set to 10^${60 - TOKEN_DECIMALS - FEED_DECIMALS}`);
  } else {
    const tx = await dataStore.setUint(Keys.pythLazerFeedMultiplierKey(TAO_TOKEN), feedMultiplier);
    await tx.wait();
    console.log(`  feedMultiplier set to 10^${60 - TOKEN_DECIMALS - FEED_DECIMALS}`);
    await new Promise((r) => setTimeout(r, 3000));
  }

  // --- 2. Create market ---
  console.log("\n--- Creating TAO/USD market ---");

  // Ensure deployer has MARKET_KEEPER
  if (!(await roleStore.hasRole(deployer.address, MARKET_KEEPER))) {
    const tx = await roleStore.grantRole(deployer.address, MARKET_KEEPER);
    await tx.wait();
    console.log("  Granted MARKET_KEEPER");
    await new Promise((r) => setTimeout(r, 3000));
  }

  const marketFactory = await ethers.getContractAt("MarketFactory", INFRA.MarketFactory);

  const tx = await marketFactory.createMarket(
    TAO_TOKEN,
    INFRA.USD0,
    INFRA.USD0,
    ethers.constants.HashZero,
    false // not reversed
  );
  const receipt = await tx.wait();
  console.log("  tx:", receipt.transactionHash);

  // Parse market token address from logs
  let marketTokenAddress: string | undefined;
  for (const log of receipt.logs) {
    try {
      const iface = new ethers.utils.Interface([
        "event MarketCreated(address marketToken, bytes32 salt, address indexToken, address longToken, address shortToken, bytes32 marketType, bool reversed)",
      ]);
      const parsed = iface.parseLog(log);
      if (parsed) {
        marketTokenAddress = parsed.args.marketToken;
        break;
      }
    } catch {
      /* not a MarketCreated event */
    }
  }

  if (!marketTokenAddress) {
    console.log("  Parsing EventEmitter logs...");
    for (const log of receipt.logs) {
      if (log.data.toLowerCase().includes(TAO_TOKEN.slice(2).toLowerCase())) {
        console.log("  Found log with TAO token, contract:", log.address);
      }
    }
    console.log("  Could not auto-parse market address. Check tx on BaseScan:", receipt.transactionHash);
  }

  if (marketTokenAddress) {
    console.log("\n========================================");
    console.log("TAO Token:         ", TAO_TOKEN);
    console.log("TAO/USD Market:    ", marketTokenAddress);
    console.log("========================================");
  }

  // Verify feed config
  console.log("\n--- Verification ---");
  console.log("  feedId:", (await dataStore.getUint(Keys.pythLazerFeedIdKey(TAO_TOKEN))).toString());
  console.log("  feedMultiplier:", (await dataStore.getUint(Keys.pythLazerFeedMultiplierKey(TAO_TOKEN))).toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
