import { expect } from "chai";
import { ethers } from "ethers";

import { deployContract } from "../../utils/deploy";
import { deployFixture } from "../../utils/fixture";
import { decimalToFloat, expandDecimals } from "../../utils/math";
import { errorsContract } from "../../utils/error";
import { grantRole } from "../../utils/role";
import * as keys from "../../utils/keys";

const MAX_UINT = ethers.constants.MaxUint256;

describe("LeverageLadder.integration", () => {
  let fixture;
  let user0;
  let config, dataStore, roleStore, ethUsdMarket;
  let test;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ config, dataStore, roleStore, ethUsdMarket } = fixture.contracts);

    // user0 needs CONFIG_KEEPER to call setLeverageLadder
    await grantRole(roleStore, user0.address, "CONFIG_KEEPER");

    test = await deployContract("LeverageLadderUtilsTest", []);
  });

  // -----------------------------------------------------------------------
  // setLeverageLadder invariant tests
  // -----------------------------------------------------------------------
  describe("setLeverageLadder invariants", () => {
    const market = () => ethUsdMarket.marketToken;

    const validLadder = () => ({
      notionals: [expandDecimals(50_000, 30), expandDecimals(200_000, 30), MAX_UINT],
      leverages: [decimalToFloat(50), decimalToFloat(25), decimalToFloat(10)],
    });

    it("rejects empty arrays", async () => {
      await expect(config.connect(user0).setLeverageLadder(market(), [], [])).to.be.revertedWithCustomError(
        errorsContract,
        "LeverageLadderMisconfigured"
      );
    });

    it("rejects mismatched array lengths", async () => {
      await expect(
        config.connect(user0).setLeverageLadder(market(), [expandDecimals(50_000, 30), MAX_UINT], [decimalToFloat(50)])
      ).to.be.revertedWithCustomError(errorsContract, "LeverageLadderMisconfigured");
    });

    it("rejects non-ascending notionals", async () => {
      const v = validLadder();
      v.notionals[1] = v.notionals[0]; // equal, not strictly ascending
      await expect(
        config.connect(user0).setLeverageLadder(market(), v.notionals, v.leverages)
      ).to.be.revertedWithCustomError(errorsContract, "LeverageLadderMisconfigured");
    });

    it("rejects increasing leverages (must be non-increasing)", async () => {
      const v = validLadder();
      v.leverages[1] = decimalToFloat(60); // 60 > 50, increasing
      await expect(
        config.connect(user0).setLeverageLadder(market(), v.notionals, v.leverages)
      ).to.be.revertedWithCustomError(errorsContract, "LeverageLadderMisconfigured");
    });

    it("rejects a leverage above market max_leverage", async () => {
      const v = validLadder();
      // hardhat default max_leverage = 100x; 200x exceeds it.
      v.leverages[0] = decimalToFloat(200);
      await expect(
        config.connect(user0).setLeverageLadder(market(), v.notionals, v.leverages)
      ).to.be.revertedWithCustomError(errorsContract, "LeverageLadderMisconfigured");
    });

    it("rejects a final tier whose maxNotionalUsd != MAX_UINT", async () => {
      const v = validLadder();
      v.notionals[v.notionals.length - 1] = expandDecimals(10_000_000, 30); // not catch-all
      await expect(
        config.connect(user0).setLeverageLadder(market(), v.notionals, v.leverages)
      ).to.be.revertedWithCustomError(errorsContract, "LeverageLadderMisconfigured");
    });

    it("writes a valid ladder to storage", async () => {
      const v = validLadder();
      await config.connect(user0).setLeverageLadder(market(), v.notionals, v.leverages);

      expect(await dataStore.getUint(keys.leverageLadderTierCountKey(market()))).to.eq(3);
      for (let i = 0; i < 3; i++) {
        expect(await dataStore.getUint(keys.leverageLadderMaxNotionalKey(market(), i))).to.eq(v.notionals[i]);
        expect(await dataStore.getUint(keys.leverageLadderMaxLeverageKey(market(), i))).to.eq(v.leverages[i]);
      }
    });

    it("clears stale tier rows when the new ladder is shorter than the previous one", async () => {
      // first push: 3 tiers
      const v = validLadder();
      await config.connect(user0).setLeverageLadder(market(), v.notionals, v.leverages);

      // second push: 2 tiers
      const shorter = {
        notionals: [expandDecimals(100_000, 30), MAX_UINT],
        leverages: [decimalToFloat(50), decimalToFloat(10)],
      };
      await config.connect(user0).setLeverageLadder(market(), shorter.notionals, shorter.leverages);

      expect(await dataStore.getUint(keys.leverageLadderTierCountKey(market()))).to.eq(2);
      expect(await dataStore.getUint(keys.leverageLadderMaxNotionalKey(market(), 0))).to.eq(shorter.notionals[0]);
      expect(await dataStore.getUint(keys.leverageLadderMaxNotionalKey(market(), 1))).to.eq(shorter.notionals[1]);

      // tier index 2 from the previous (longer) ladder must be cleared
      expect(await dataStore.getUint(keys.leverageLadderMaxNotionalKey(market(), 2))).to.eq(0);
      expect(await dataStore.getUint(keys.leverageLadderMaxLeverageKey(market(), 2))).to.eq(0);
    });
  });

  // -----------------------------------------------------------------------
  // End-to-end lookup against a configured market
  // -----------------------------------------------------------------------
  describe("getMaxLeverageForNotional after setLeverageLadder", () => {
    beforeEach(async () => {
      // 3 tiers on ethUsdMarket: [0–50k → 50x] [50k–200k → 25x] [200k+ → 10x]
      await config
        .connect(user0)
        .setLeverageLadder(
          ethUsdMarket.marketToken,
          [expandDecimals(50_000, 30), expandDecimals(200_000, 30), MAX_UINT],
          [decimalToFloat(50), decimalToFloat(25), decimalToFloat(10)]
        );
    });

    it("returns tier-1 cap for notional below the first boundary", async () => {
      expect(
        await test.getMaxLeverageForNotional(dataStore.address, ethUsdMarket.marketToken, expandDecimals(10_000, 30))
      ).to.eq(decimalToFloat(50));
    });

    it("returns tier-2 cap for notional crossing into the middle band", async () => {
      expect(
        await test.getMaxLeverageForNotional(dataStore.address, ethUsdMarket.marketToken, expandDecimals(100_000, 30))
      ).to.eq(decimalToFloat(25));
    });

    it("returns the catch-all cap for notional above the last finite boundary", async () => {
      expect(
        await test.getMaxLeverageForNotional(
          dataStore.address,
          ethUsdMarket.marketToken,
          expandDecimals(10_000_000, 30)
        )
      ).to.eq(decimalToFloat(10));
    });

    it("matches tier exactly at the boundary (≤ semantics)", async () => {
      expect(
        await test.getMaxLeverageForNotional(dataStore.address, ethUsdMarket.marketToken, expandDecimals(50_000, 30))
      ).to.eq(decimalToFloat(50));
    });

    it("falls to the next tier just past the boundary", async () => {
      expect(
        await test.getMaxLeverageForNotional(
          dataStore.address,
          ethUsdMarket.marketToken,
          expandDecimals(50_000, 30).add(1)
        )
      ).to.eq(decimalToFloat(25));
    });
  });

  // -----------------------------------------------------------------------
  // No ladder configured — pre-ladder behaviour preserved
  // -----------------------------------------------------------------------
  it("returns type(uint256).max when no ladder is configured for the market", async () => {
    expect(
      await test.getMaxLeverageForNotional(dataStore.address, ethUsdMarket.marketToken, expandDecimals(100_000, 30))
    ).to.eq(MAX_UINT);
    // Sanity: tier count key is unset.
    expect(await dataStore.getUint(keys.leverageLadderTierCountKey(ethUsdMarket.marketToken))).to.eq(0);
  });
});
