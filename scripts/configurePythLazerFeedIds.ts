/**
 * Script to configure Pyth Lazer feed IDs in the DataStore contract.
 *
 * Usage:
 *   ACCOUNT_KEY=0x... npx hardhat run scripts/configurePythLazerFeedIds.ts --network baseSepolia
 *
 * Or with cast (per-token):
 *   See the computed keys printed by this script and use:
 *   cast send $DATASTORE "setUint(bytes32,uint256)" $KEY $VALUE --rpc-url $RPC --private-key $KEY
 */
import { ethers } from "hardhat";

interface TokenFeedConfig {
  name: string;
  address: string;
  feedId: number;
  tokenDecimals: number;
  feedDecimals: number;
  inverted: boolean;
}

const DATASTORE_ADDRESS = "0xBaD049d5FedE7Bd9022F7E750B982349fE17e83E";

const TOKEN_CONFIGS: TokenFeedConfig[] = [
  {
    name: "USDC",
    address: "0xFDDFE40Ade3eE9aDE4A2e185C750cf28025BFd6b",
    feedId: 7,
    tokenDecimals: 6,
    feedDecimals: 8,
    inverted: false,
  },
  {
    name: "WETH",
    address: "0x4200000000000000000000000000000000000006",
    feedId: 2,
    tokenDecimals: 18,
    feedDecimals: 8,
    inverted: false,
  },
  {
    name: "WBTC",
    address: "0xD8a6E3FCA403d79b6AD6216b60527F51cc967D39",
    feedId: 1,
    tokenDecimals: 8,
    feedDecimals: 8,
    inverted: false,
  },
  {
    name: "EUR",
    address: "0x86e6ab05217318Db4A63f0361BADBf5aF0c69270",
    feedId: 327,
    tokenDecimals: 6,
    feedDecimals: 5,
    inverted: false,
  },
  {
    name: "GBP",
    address: "0x29c46a7d11B6A3051f51a47eE93AAc03a907C81e",
    feedId: 333,
    tokenDecimals: 6,
    feedDecimals: 5,
    inverted: false,
  },
  {
    name: "GOLD",
    address: "0xC2E2d25b96976fC054A5A262e2bc6Fbe8d9bB1e4",
    feedId: 346,
    tokenDecimals: 6,
    feedDecimals: 3,
    inverted: false,
  },
  {
    name: "JPY",
    address: "0x5E45Df87fC8f91D5Bc73B6e75D63742dbE01400A",
    feedId: 340,
    tokenDecimals: 6,
    feedDecimals: 3,
    inverted: true,
  },
];

function hashData(types: string[], values: any[]): string {
  return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(types, values));
}

function hashString(str: string): string {
  return hashData(["string"], [str]);
}

async function main() {
  const PYTH_LAZER_FEED_ID = hashString("PYTH_LAZER_FEED_ID");
  const PYTH_LAZER_FEED_MULTIPLIER = hashString("PYTH_LAZER_FEED_MULTIPLIER");
  const PYTH_LAZER_FEED_INVERTED = hashString("PYTH_LAZER_FEED_INVERTED");

  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);
  console.log("Balance:", ethers.utils.formatEther(await signer.getBalance()), "ETH");
  console.log("Nonce:", await signer.getTransactionCount());

  const dataStore = await ethers.getContractAt(
    [
      "function setUint(bytes32 key, uint256 value) external returns (uint256)",
      "function setBool(bytes32 key, bool value) external returns (bool)",
      "function getUint(bytes32 key) external view returns (uint256)",
      "function getBool(bytes32 key) external view returns (bool)",
    ],
    DATASTORE_ADDRESS,
    signer
  );

  for (const token of TOKEN_CONFIGS) {
    console.log(`\n=== ${token.name} (${token.address}) ===`);

    // 1. Set feed ID
    const feedIdKey = hashData(["bytes32", "address"], [PYTH_LAZER_FEED_ID, token.address]);
    const currentFeedId = await dataStore.getUint(feedIdKey);
    console.log(`  Feed ID: current=${currentFeedId}, target=${token.feedId}`);

    if (currentFeedId.toNumber() !== token.feedId) {
      const tx = await dataStore.setUint(feedIdKey, token.feedId);
      console.log(`  Setting feed ID... tx: ${tx.hash}`);
      await tx.wait(1);
      console.log(`  Feed ID set to ${token.feedId}`);
    } else {
      console.log(`  Feed ID already correct`);
    }

    // 2. Set multiplier: 10^(60 - tokenDecimals - feedDecimals)
    const multiplierKey = hashData(["bytes32", "address"], [PYTH_LAZER_FEED_MULTIPLIER, token.address]);
    const exponent = 60 - token.tokenDecimals - token.feedDecimals;
    const multiplier = ethers.BigNumber.from(10).pow(exponent);
    const currentMultiplier = await dataStore.getUint(multiplierKey);
    console.log(`  Multiplier: current=${currentMultiplier}, target=10^${exponent}`);

    if (!currentMultiplier.eq(multiplier)) {
      const tx = await dataStore.setUint(multiplierKey, multiplier);
      console.log(`  Setting multiplier... tx: ${tx.hash}`);
      await tx.wait(1);
      console.log(`  Multiplier set to 10^${exponent}`);
    } else {
      console.log(`  Multiplier already correct`);
    }

    // 3. Set inverted flag (only if true)
    if (token.inverted) {
      const invertedKey = hashData(["bytes32", "address"], [PYTH_LAZER_FEED_INVERTED, token.address]);
      const currentInverted = await dataStore.getBool(invertedKey);
      console.log(`  Inverted: current=${currentInverted}, target=${token.inverted}`);

      if (!currentInverted) {
        const tx = await dataStore.setBool(invertedKey, true);
        console.log(`  Setting inverted flag... tx: ${tx.hash}`);
        await tx.wait(1);
        console.log(`  Inverted flag set to true`);
      } else {
        console.log(`  Inverted flag already correct`);
      }
    }
  }

  console.log("\n=== All feed IDs configured! ===");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
