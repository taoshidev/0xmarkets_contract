/**
 * Write ALL market config directly to DataStore at prebuilt keys.
 * Config.setUint uses different key derivation than the frontend prebuild,
 * so we write directly to the keys the frontend reads.
 *
 * Run: npx hardhat run scripts/fix-xag-all-keys.ts --network baseSepolia
 */
import { ethers } from "hardhat";

const DATA_STORE = "0x0cA7D71845cb485B7593bBdCbcac93d82d52d053";

// All prebuilt keys for 0x6D260c market + GOLD-matching values
const CONFIG: [string, string, any][] = [
  // [name, prebuilt key hash, value]
  [
    "minCollateralFactor",
    "0xca2cccd3de305ee1f5c7afc000e19f27159fdc388d79e88eee8fd5a73ed65d89",
    "3333000000000000000000000000",
  ], // 3.333e27 → 200x
  ["minCollateralFactorForOI_Long", "0x9a1f2fdd004c2282db50e18fa514d5525ce16285585de3e07ceb94cc8c81d55a", "0"],
  ["minCollateralFactorForOI_Short", "0xa405a43a19ffa5e0ee362461bf40c13b5985c7bec3403d4d3d2db3693a08d5f2", "0"],
  [
    "reserveFactorLong",
    "0x2d74d43eeb7eb8027c469bed000538a6b91d48360290db92c094a3c2a5c91a34",
    "950000000000000000000000000000",
  ], // 9.5e29
  [
    "reserveFactorShort",
    "0x1d3f86fae329a0bc96116261a6d54e1acbfdae7e19b1574234fc413896b509f2",
    "950000000000000000000000000000",
  ], // 9.5e29
  [
    "openInterestReserveFactorLong",
    "0x901f5473a3871a752ffe7eaee3e7f0cd0a3822123980575aee05f329b4d80ac8",
    "900000000000000000000000000000",
  ], // 9e29
  [
    "openInterestReserveFactorShort",
    "0xa4a62539573b3befbdf36876ecf961e035aaec8f19f5f4e9c993ebdd5e64fcc6",
    "900000000000000000000000000000",
  ], // 9e29
  [
    "maxOpenInterestLong",
    "0x246cf6ffb0a29409370678a9029e69e24c511e1d947efa8f9721e3c8e6cfdd08",
    "1000000000000000000000000000000000000000",
  ], // 1e39
  [
    "maxOpenInterestShort",
    "0xa5e8159020a489a617ade6a00d0769623ad7d3965ca4ed1fe7eb0bfb77a63ace",
    "1000000000000000000000000000000000000000",
  ], // 1e39
  ["fundingFactor", "0xfde0cebecd9139980379c1cb56af7f3cdc09dda3363ed48bd02787b26b03198b", "1527777777777777777777"], // 1.527e21
  ["borrowingFactorLong", "0x723c0e26b1a85a0af079e5049928b19bc31f2b7bad35510c0c2ea24b2c7906db", "648148148148148148"], // 6.481e17
  ["borrowingFactorShort", "0xf0f14b5b316d1e0f220e3969e922742559378e7388d0079b0c448ba67199b311", "648148148148148148"], // 6.481e17
  [
    "positionImpactFactorPositive",
    "0xd09aeeae2cbf2350eb0de66b750a01ac9f70a02a9f67e88ee4c3e85f4918f778",
    "80000000000000000000000",
  ], // 8e22
  [
    "positionImpactFactorNegative",
    "0x39976b4f5e88683097b83d95e8e4374c3c534bef7c6585452e2108bfd73a4260",
    "100000000000000000000000",
  ], // 1e23
  [
    "positionImpactExponentFactor",
    "0x7d0c8c4b5ab7ec395f0251c2a40ec624438b52d98f803fedbd0f19d83a2c93b1",
    "1450000000000000000000000000000",
  ], // 1.45e30
  [
    "swapImpactExponentFactor",
    "0xd4ac259a384d62397d0c9d9ec7af06981d40ed2425790488fb430914f6f6a037",
    "2000000000000000000000000000000",
  ], // 2e30
];

async function main() {
  const dataStore = await ethers.getContractAt("DataStore", DATA_STORE);

  for (const [name, key, value] of CONFIG) {
    const current = await dataStore.getUint(key);
    const target = ethers.BigNumber.from(value);
    if (current.eq(target)) {
      console.log(`  ${name}: already correct (${current.toString().substring(0, 20)})`);
      continue;
    }
    const tx = await dataStore.setUint(key, target);
    await tx.wait();
    console.log(`  ${name}: set → ${value.substring(0, 20)}... (${tx.hash.substring(0, 18)}...)`);
  }

  // Verify leverage
  const mcf = await dataStore.getUint(CONFIG[0][1]);
  const lev = mcf.gt(0) ? Math.floor(1e30 / Number(mcf.toString())) : 0;
  console.log(`\nLeverage: ${lev}x (MCF=${mcf.toString()})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
