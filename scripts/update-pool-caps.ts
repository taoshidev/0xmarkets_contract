import { ethers } from "hardhat";
import * as keys from "../utils/keys";
import { encodeData } from "../utils/hash";
import { getFullKey } from "../utils/config";
import { expandDecimals, decimalToFloat } from "../utils/math";

const USDC = "0xFDDFE40Ade3eE9aDE4A2e185C750cf28025BFd6b";

const ACTIVE_MARKETS = [
  {
    name: "EUR",
    marketToken: "0xD25DaA1A1c740c070A6DC6F0287bD14398C090E4",
    maxPoolAmount: expandDecimals(25_000_000, 6),
    maxPoolUsdForDeposit: decimalToFloat(25_000_000),
    maxOILongs: decimalToFloat(12_500_000),
    maxOIShorts: decimalToFloat(12_500_000),
  },
  {
    name: "GBP",
    marketToken: "0x36C1EF9F39f42d7e84FB054D15E4d3171b7977BF",
    maxPoolAmount: expandDecimals(25_000_000, 6),
    maxPoolUsdForDeposit: decimalToFloat(25_000_000),
    maxOILongs: decimalToFloat(12_500_000),
    maxOIShorts: decimalToFloat(12_500_000),
  },
  {
    name: "GOLD",
    marketToken: "0xBA69c6dc7F28E1299e20D5D1d0a48529cB189980",
    maxPoolAmount: expandDecimals(37_500_000, 6),
    maxPoolUsdForDeposit: decimalToFloat(37_500_000),
    maxOILongs: decimalToFloat(18_750_000),
    maxOIShorts: decimalToFloat(18_750_000),
  },
  {
    name: "JPY",
    marketToken: "0x4834B9a77b32ca7F1d8A20cf7CA886d92Be98aeF",
    maxPoolAmount: expandDecimals(25_000_000, 6),
    maxPoolUsdForDeposit: decimalToFloat(25_000_000),
    maxOILongs: decimalToFloat(12_500_000),
    maxOIShorts: decimalToFloat(12_500_000),
  },
  {
    name: "WBTC",
    marketToken: "0xA4c80F91f4F4b4095220048cb24186e20e48B9D4",
    maxPoolAmount: expandDecimals(50_000_000, 6),
    maxPoolUsdForDeposit: decimalToFloat(50_000_000),
    maxOILongs: decimalToFloat(25_000_000),
    maxOIShorts: decimalToFloat(25_000_000),
  },
  {
    name: "WETH",
    marketToken: "0x4DF435E8D40740291571Df779e48662C9521ed7d",
    maxPoolAmount: expandDecimals(50_000_000, 6),
    maxPoolUsdForDeposit: decimalToFloat(50_000_000),
    maxOILongs: decimalToFloat(25_000_000),
    maxOIShorts: decimalToFloat(25_000_000),
  },
];

async function main() {
  const config = await ethers.getContract("Config");
  const dataStore = await ethers.getContract("DataStore");

  const multicallData: string[] = [];

  for (const market of ACTIVE_MARKETS) {
    console.log(`\n--- ${market.name} (${market.marketToken}) ---`);

    const updates = [
      {
        baseKey: keys.MAX_POOL_AMOUNT,
        data: encodeData(["address", "address"], [market.marketToken, USDC]),
        value: market.maxPoolAmount,
        label: "maxPoolAmount",
      },
      {
        baseKey: keys.MAX_POOL_USD_FOR_DEPOSIT,
        data: encodeData(["address", "address"], [market.marketToken, USDC]),
        value: market.maxPoolUsdForDeposit,
        label: "maxPoolUsdForDeposit",
      },
      {
        baseKey: keys.MAX_OPEN_INTEREST,
        data: encodeData(["address", "bool"], [market.marketToken, true]),
        value: market.maxOILongs,
        label: "maxOILongs",
      },
      {
        baseKey: keys.MAX_OPEN_INTEREST,
        data: encodeData(["address", "bool"], [market.marketToken, false]),
        value: market.maxOIShorts,
        label: "maxOIShorts",
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
  console.log("Confirmed! All pool caps updated.");
}

main().catch(console.error);
