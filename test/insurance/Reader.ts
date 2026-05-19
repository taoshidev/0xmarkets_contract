import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { handleDeposit } from "../../utils/deposit";
import { prices } from "../../utils/prices";
import { expandDecimals, decimalToFloat, percentageToFloat } from "../../utils/math";
import * as keys from "../../utils/keys";

describe("Reader insurance fund getters", () => {
  let fixture;
  let dataStore, reader, ethUsdMarket, wnt;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ dataStore, reader, ethUsdMarket, wnt } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(1_000_000, 6),
      },
    });
  });

  describe("getInsuranceFundBalance", () => {
    it("returns 0 by default", async () => {
      expect(await reader.getInsuranceFundBalance(dataStore.address, ethUsdMarket.marketToken, wnt.address)).eq(0);
    });

    it("returns the bookkept value", async () => {
      const amount = expandDecimals(7, 18);
      await dataStore.setUint(keys.insuranceFundBalanceKey(ethUsdMarket.marketToken, wnt.address), amount);
      expect(await reader.getInsuranceFundBalance(dataStore.address, ethUsdMarket.marketToken, wnt.address)).eq(amount);
    });
  });

  describe("getInsuranceFundEpochState", () => {
    it("returns zeros when fund is uninitialized", async () => {
      const [epochValue, currentValue, drawdown, epochStart] = await reader.getInsuranceFundEpochState(
        dataStore.address,
        ethUsdMarket,
        prices.ethUsdMarket
      );
      expect(epochValue).eq(0);
      // currentValue is still computed even when fund is disabled — it's the
      // live pool USD that operators want to see on a dashboard.
      expect(currentValue).gt(0);
      expect(drawdown).eq(0);
      expect(epochStart).eq(0);
    });

    it("reports drawdown after snapshot + pool drop", async () => {
      // Simulate a snapshot directly. The SettlementHandler tests cover the
      // real entrypoint; here we focus on the Reader composition.
      await dataStore.setUint(keys.insuranceFundEpochPoolValueKey(ethUsdMarket.marketToken), decimalToFloat(6_000_000));
      const epochStartTs = Math.floor(Date.now() / 1000);
      await dataStore.setUint(keys.insuranceFundEpochStartKey(ethUsdMarket.marketToken), epochStartTs);

      // Drop 100 WETH = ~$500k = ~8.33% drawdown vs $6M snapshot.
      await dataStore.decrementUint(keys.poolAmountKey(ethUsdMarket.marketToken, wnt.address), expandDecimals(100, 18));

      const [epochValue, currentValue, drawdown, epochStart] = await reader.getInsuranceFundEpochState(
        dataStore.address,
        ethUsdMarket,
        prices.ethUsdMarket
      );
      expect(epochValue).eq(decimalToFloat(6_000_000));
      expect(currentValue).lt(epochValue);
      expect(drawdown).gt(percentageToFloat("8%"));
      expect(drawdown).lt(percentageToFloat("9%"));
      expect(epochStart).eq(epochStartTs);
    });
  });
});
