import hre from "hardhat";
import { getDepositCount, getDepositKeys } from "../utils/deposit";

const { ethers } = hre;

// Pyth Lazer Feed Provider address on Base Sepolia
const PYTH_LAZER_FEED_PROVIDER = "0x93704d7C5E8CbB668c42Dd0a131d5A126244776e";

// Token to Pyth Lazer feed ID mapping
const PYTH_FEED_IDS: Record<string, number> = {
  "0xA36a6765cc50b1F4678fA91770dcfCf48727730F": 7, // mUSDC
  "0x4200000000000000000000000000000000000006": 2, // WETH
  "0xD8a6E3FCA403d79b6AD6216b60527F51cc967D39": 1, // WBTC
};

async function main() {
  console.log("Executing pending deposits...");

  const dataStore = await ethers.getContract("DataStore");
  const reader = await ethers.getContract("Reader");
  const depositHandler = await ethers.getContract("DepositHandler");

  const [wallet] = await ethers.getSigners();
  console.log("Executor wallet:", wallet.address);

  // Check if wallet has ORDER_KEEPER role
  const roleStore = await ethers.getContract("RoleStore");
  const ORDER_KEEPER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ORDER_KEEPER"));
  const hasRole = await roleStore.hasRole(wallet.address, ORDER_KEEPER_ROLE);
  console.log("Has ORDER_KEEPER role:", hasRole);

  if (!hasRole) {
    console.error("Wallet does not have ORDER_KEEPER role. Cannot execute deposits.");
    console.log("Grant role with: await roleStore.grantRole(wallet.address, ORDER_KEEPER_ROLE)");
    return;
  }

  // Get pending deposits
  const depositCount = await getDepositCount(dataStore);
  console.log("Total deposits:", depositCount.toString());

  if (depositCount.eq(0)) {
    console.log("No pending deposits to execute");
    return;
  }

  const depositKeys = await getDepositKeys(dataStore, 0, depositCount);
  console.log("Deposit keys:", depositKeys);

  for (const key of depositKeys) {
    console.log("\n--- Processing deposit:", key, "---");

    const deposit = await reader.getDeposit(dataStore.address, key);
    console.log("Market:", deposit.addresses.market);
    console.log("Long token:", deposit.addresses.initialLongToken);
    console.log("Short token:", deposit.addresses.initialShortToken);
    console.log("Long amount:", deposit.numbers.initialLongTokenAmount.toString());
    console.log("Short amount:", deposit.numbers.initialShortTokenAmount.toString());

    // Build oracle params - for Pyth Lazer, we pass empty arrays
    // because the PythLazerFeedProvider reads prices from on-chain state
    // that was updated by the Pyth Lazer keeper
    const oracleParams = {
      tokens: [],
      providers: [],
      data: [],
    };

    console.log("Executing deposit with oracle params:", oracleParams);

    try {
      const tx = await depositHandler.executeDeposit(key, oracleParams, {
        gasLimit: 3000000,
      });
      console.log("Transaction sent:", tx.hash);
      const receipt = await tx.wait();
      console.log("Transaction confirmed in block:", receipt.blockNumber);
      console.log("Gas used:", receipt.gasUsed.toString());
    } catch (error: any) {
      console.error("Failed to execute deposit:", error.message);
      if (error.data) {
        console.error("Error data:", error.data);
      }
    }
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
