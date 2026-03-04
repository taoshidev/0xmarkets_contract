import { ethers } from "hardhat";
import * as keys from "../utils/keys";
import { encodeData } from "../utils/hash";
import { getFullKey } from "../utils/config";

// Current market addresses (Base Sepolia v1.7 deployment)
const ACTIVE_MARKETS = [
  { name: "EUR/USD", marketToken: "0xd3c882AbD5854267d509b944429faA82f3d36088" },
  { name: "GBP/USD", marketToken: "0x981977239025C8F2E133f87b79bEcc587B0e7562" },
  { name: "GOLD/USD", marketToken: "0xf008E4b0962Bf5907d7dB11e88C9EA423D4e2563" },
  { name: "USD/JPY", marketToken: "0xF28b8572AD4c0BfF5EdfB6579b1Fa6fF0A9Eef5A" },
  { name: "WBTC/USD", marketToken: "0x3c3D358701B4df855b3B88D4c840f694c9db8324" },
  { name: "WETH/USD", marketToken: "0x41a281111Aa12a968564a33f9293D9B7b0dDFf19" },
];

// Set swap impact factors to zero for same-collateral markets (longToken == shortToken).
// Per GMX ExecuteDepositUtils.sol: "for markets where longToken == shortToken,
// the price impact factor should be set to zero"
// All 0xMarkets markets use USDC as both long and short token.
const NEW_NEGATIVE_SWAP_IMPACT_FACTOR = ethers.BigNumber.from(0);
const NEW_POSITIVE_SWAP_IMPACT_FACTOR = ethers.BigNumber.from(0);

async function main() {
  const config = await ethers.getContract("Config");
  const dataStore = await ethers.getContract("DataStore");

  const multicallData: string[] = [];

  for (const market of ACTIVE_MARKETS) {
    console.log(`\n--- ${market.name} (${market.marketToken}) ---`);

    const updates = [
      {
        baseKey: keys.SWAP_IMPACT_FACTOR,
        data: encodeData(["address", "bool"], [market.marketToken, false]),
        value: NEW_NEGATIVE_SWAP_IMPACT_FACTOR,
        label: "negativeSwapImpactFactor",
      },
      {
        baseKey: keys.SWAP_IMPACT_FACTOR,
        data: encodeData(["address", "bool"], [market.marketToken, true]),
        value: NEW_POSITIVE_SWAP_IMPACT_FACTOR,
        label: "positiveSwapImpactFactor",
      },
    ];

    for (const update of updates) {
      const fullKey = getFullKey(update.baseKey, update.data);
      const currentValue = await dataStore.getUint(fullKey);
      if (currentValue.eq(update.value)) {
        console.log(`  ${update.label}: already set, skipping`);
        continue;
      }
      console.log(`  ${update.label}: ${currentValue.toString()} -> ${update.value.toString()}`);
      multicallData.push(config.interface.encodeFunctionData("setUint", [update.baseKey, update.data, update.value]));
    }
  }

  if (multicallData.length === 0) {
    console.log("\nAll values already set. Nothing to do.");
    return;
  }

  console.log(`\nSending ${multicallData.length} updates in a single multicall tx...`);
  const tx = await config.multicall(multicallData);
  console.log(`tx: ${tx.hash}`);
  await tx.wait();
  console.log("Confirmed! Swap impact factors updated for all markets.");
}

main().catch(console.error);
