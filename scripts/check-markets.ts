import { ethers } from "hardhat";

async function main() {
  const reader = await ethers.getContract("Reader");
  const dataStore = await ethers.getContract("DataStore");
  const markets = await reader.getMarkets(dataStore.address, 0, 100);
  console.log("Total markets:", markets.length);
  for (let i = 0; i < markets.length; i++) {
    const m = markets[i];
    console.log(
      `${i}: market=${m.marketToken} index=${m.indexToken} long=${m.longToken} short=${m.shortToken} reversed=${m.reversed}`
    );
  }
}

main().catch(console.error);
