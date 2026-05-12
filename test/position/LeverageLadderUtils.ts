import { expect } from "chai";
import { BigNumber, ethers } from "ethers";

import { deployContract } from "../../utils/deploy";
import { deployFixture } from "../../utils/fixture";
import * as keys from "../../utils/keys";

const MAX_UINT = ethers.constants.MaxUint256;

describe("LeverageLadderUtils", () => {
  let fixture;
  let dataStore;
  let test;
  // Arbitrary market address — only used as a namespace for the ladder keys.
  const market = "0x000000000000000000000000000000000000a11c";

  async function setLadder(tiers: { maxNotional: BigNumber | string | number; maxLeverage: number }[]) {
    await dataStore.setUint(keys.leverageLadderTierCountKey(market), tiers.length);
    for (let i = 0; i < tiers.length; i++) {
      await dataStore.setUint(keys.leverageLadderMaxNotionalKey(market, i), tiers[i].maxNotional);
      await dataStore.setUint(keys.leverageLadderMaxLeverageKey(market, i), tiers[i].maxLeverage);
    }
  }

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ dataStore } = fixture.contracts);
    test = await deployContract("LeverageLadderUtilsTest", []);
  });

  it("returns type(uint256).max when no ladder is configured", async () => {
    const result = await test.getMaxLeverageForNotional(dataStore.address, market, 1_000);
    expect(result).to.eq(MAX_UINT);
  });

  it("single tier with MAX_UINT notional returns its leverage for any notional", async () => {
    await setLadder([{ maxNotional: MAX_UINT, maxLeverage: 25 }]);

    expect(await test.getMaxLeverageForNotional(dataStore.address, market, 0)).to.eq(25);
    expect(await test.getMaxLeverageForNotional(dataStore.address, market, 10_000)).to.eq(25);
    expect(await test.getMaxLeverageForNotional(dataStore.address, market, MAX_UINT)).to.eq(25);
  });

  describe("multi-tier ladder", () => {
    beforeEach(async () => {
      // Tiers: [0–50k → 200x] [50k–200k → 150x] [200k+ → 50x]
      await setLadder([
        { maxNotional: 50_000, maxLeverage: 200 },
        { maxNotional: 200_000, maxLeverage: 150 },
        { maxNotional: MAX_UINT, maxLeverage: 50 },
      ]);
    });

    it("hits tier 1 for small notional", async () => {
      expect(await test.getMaxLeverageForNotional(dataStore.address, market, 1_000)).to.eq(200);
    });

    it("hits the middle tier", async () => {
      expect(await test.getMaxLeverageForNotional(dataStore.address, market, 100_000)).to.eq(150);
    });

    it("hits the catch-all tier", async () => {
      expect(await test.getMaxLeverageForNotional(dataStore.address, market, 1_000_000)).to.eq(50);
    });

    it("notional == tier.maxNotional matches that tier (≤ semantics)", async () => {
      expect(await test.getMaxLeverageForNotional(dataStore.address, market, 50_000)).to.eq(200);
      expect(await test.getMaxLeverageForNotional(dataStore.address, market, 200_000)).to.eq(150);
    });

    it("notional == tier.maxNotional + 1 falls to the next tier", async () => {
      expect(await test.getMaxLeverageForNotional(dataStore.address, market, 50_001)).to.eq(150);
      expect(await test.getMaxLeverageForNotional(dataStore.address, market, 200_001)).to.eq(50);
    });

    it("notional == 0 matches the first tier", async () => {
      expect(await test.getMaxLeverageForNotional(dataStore.address, market, 0)).to.eq(200);
    });
  });
});
