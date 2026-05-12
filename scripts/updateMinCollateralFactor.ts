import { ethers } from "hardhat";
import * as keys from "../utils/keys";
import { encodeData } from "../utils/hash";
import { getFullKey } from "../utils/config";
import { percentageToFloat } from "../utils/math";

// Leverage targets:
//   Crypto (ETH, BTC): 100x  -> minCollateralFactor = 1/100 = 1%
//   Gold:              200x  -> minCollateralFactor = 1/200 = 0.5%
//   FX (EUR, GBP, JPY): 500x -> minCollateralFactor = 1/500 = 0.2%

const MARKETS = [
  // Crypto — 100x leverage
  {
    name: "WETH",
    marketToken: "0x4DF435E8D40740291571Df779e48662C9521ed7d",
    minCollateralFactor: percentageToFloat("1%"), // 100x
  },
  {
    name: "WBTC",
    marketToken: "0xA4c80F91f4F4b4095220048cb24186e20e48B9D4",
    minCollateralFactor: percentageToFloat("1%"), // 100x
  },
  // Gold — 200x leverage
  {
    name: "GOLD",
    marketToken: "0xBA69c6dc7F28E1299e20D5D1d0a48529cB189980",
    minCollateralFactor: percentageToFloat("0.5%"), // 200x
  },
  // FX — 500x leverage
  {
    name: "EUR",
    marketToken: "0xD25DaA1A1c740c070A6DC6F0287bD14398C090E4",
    minCollateralFactor: percentageToFloat("0.2%"), // 500x
  },
  {
    name: "GBP",
    marketToken: "0x36C1EF9F39f42d7e84FB054D15E4d3171b7977BF",
    minCollateralFactor: percentageToFloat("0.2%"), // 500x
  },
  {
    name: "JPY",
    marketToken: "0x4834B9a77b32ca7F1d8A20cf7CA886d92Be98aeF",
    minCollateralFactor: percentageToFloat("0.2%"), // 500x
  },
];

async function main() {
  const config = await ethers.getContract("Config");
  const dataStore = await ethers.getContract("DataStore");

  const multicallData: string[] = [];

  for (const market of MARKETS) {
    console.log(`\n--- ${market.name} (${market.marketToken}) ---`);

    const baseKey = keys.MIN_COLLATERAL_FACTOR;
    const data = encodeData(["address"], [market.marketToken]);
    const fullKey = getFullKey(baseKey, data);
    const currentValue = await dataStore.getUint(fullKey);

    if (currentValue.eq(market.minCollateralFactor)) {
      console.log(`  minCollateralFactor: already set, skipping`);
      continue;
    }

    console.log(`  minCollateralFactor: ${currentValue.toString()} -> ${market.minCollateralFactor.toString()}`);
    multicallData.push(config.interface.encodeFunctionData("setUint", [baseKey, data, market.minCollateralFactor]));
  }

  if (multicallData.length === 0) {
    console.log("\nAll values already set. Nothing to do.");
    return;
  }

  console.log(`\nSending ${multicallData.length} updates in a single multicall tx...`);
  const tx = await config.multicall(multicallData);
  console.log(`tx: ${tx.hash}`);
  await tx.wait();
  console.log("Confirmed! All minCollateralFactor values updated.");
}

main().catch(console.error);
