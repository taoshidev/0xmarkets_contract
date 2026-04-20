import { expect } from "chai";
import { deployContract } from "../../utils/deploy";
import { deployFixture } from "../../utils/fixture";

import { prices } from "../../utils/prices";
import { handleOrder, OrderType } from "../../utils/order";
import { decimalToFloat, expandDecimals, percentageToFloat } from "../../utils/math";
import * as keys from "../../utils/keys";
import { handleDeposit } from "../../utils/deposit";

describe("MarketUtils", () => {
  let fixture;
  let user0;
  let dataStore, ethUsdMarket, wnt;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, wnt } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(1_000_000, 6),
      },
    });
  });

  it("getUsageFactor doesn't account for open interest if IGNORE_OPEN_INTEREST_FOR_USAGE_FACTOR is set", async () => {
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200_000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    const marketUtilsTest = await deployContract("MarketUtilsTest", []);
    const poolUsd = await marketUtilsTest.getPoolUsdWithoutPnl(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket,
      true,
      true
    );
    const reservedUsd = await marketUtilsTest.getReservedUsd(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket,
      true
    );
    let usageFactor = await marketUtilsTest.getUsageFactor(dataStore.address, ethUsdMarket, true, reservedUsd, poolUsd);

    const openInterest = await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, true));
    let maxOpenInterest = await dataStore.getUint(keys.maxOpenInterestKey(ethUsdMarket.marketToken, true));

    expect(await dataStore.getBool(keys.IGNORE_OPEN_INTEREST_FOR_USAGE_FACTOR)).eq(false);
    expect(usageFactor).eq(percentageToFloat("8%"));
    expect(openInterest).eq(decimalToFloat(200_000));
    expect(maxOpenInterest).eq(decimalToFloat(1_000_000_000));

    await dataStore.setUint(keys.maxOpenInterestKey(ethUsdMarket.marketToken, true), decimalToFloat(400_000));

    usageFactor = await marketUtilsTest.getUsageFactor(dataStore.address, ethUsdMarket, true, reservedUsd, poolUsd);
    maxOpenInterest = await dataStore.getUint(keys.maxOpenInterestKey(ethUsdMarket.marketToken, true));
    expect(usageFactor).eq(percentageToFloat("50%"));
    expect(maxOpenInterest).eq(decimalToFloat(400_000));

    await dataStore.setBool(keys.IGNORE_OPEN_INTEREST_FOR_USAGE_FACTOR, true);

    usageFactor = await marketUtilsTest.getUsageFactor(dataStore.address, ethUsdMarket, true, reservedUsd, poolUsd);
    maxOpenInterest = await dataStore.getUint(keys.maxOpenInterestKey(ethUsdMarket.marketToken, true));

    expect(usageFactor).eq(percentageToFloat("8%"));
    expect(openInterest).eq(decimalToFloat(200_000));
    expect(maxOpenInterest).eq(decimalToFloat(400_000));
    expect(usageFactor).eq(percentageToFloat("8%"));
  });

  describe("getDynamicMmr", () => {
    // Market config used for every case below:
    //   max_leverage = 100x       min_leverage = 1x
    //   min_mmr      = 0.3%       max_mmr      = 10%       mmr_tuning = 0.5%
    //
    // rawMmr = (currLev / maxLev) * tuning, clamped to [min_mmr, max_mmr]
    const setMmrParams = async (marketToken, cfg) => {
      await dataStore.setUint(keys.maxLeverageKey(marketToken), cfg.maxLeverage);
      await dataStore.setUint(keys.minLeverageKey(marketToken), cfg.minLeverage);
      await dataStore.setUint(keys.minMmrKey(marketToken), cfg.minMmr);
      await dataStore.setUint(keys.maxMmrKey(marketToken), cfg.maxMmr);
      await dataStore.setUint(keys.mmrTuningKey(marketToken), cfg.mmrTuning);
    };

    const cryptoCfg = {
      maxLeverage: decimalToFloat(100),
      minLeverage: decimalToFloat(1),
      minMmr: percentageToFloat("0.3%"),
      maxMmr: percentageToFloat("10%"),
      mmrTuning: percentageToFloat("0.5%"),
    };

    it("returns max_mmr when collateralUsd is 0 (defensive)", async () => {
      const marketUtilsTest = await deployContract("MarketUtilsTest", []);
      await setMmrParams(ethUsdMarket.marketToken, cryptoCfg);

      const mmr = await marketUtilsTest.getDynamicMmr(
        dataStore.address,
        ethUsdMarket.marketToken,
        decimalToFloat(1_000_000), // $1M size
        0
      );
      expect(mmr).eq(cryptoCfg.maxMmr);
    });

    it("returns max_mmr when max_leverage is 0 (defensive)", async () => {
      const marketUtilsTest = await deployContract("MarketUtilsTest", []);
      await setMmrParams(ethUsdMarket.marketToken, { ...cryptoCfg, maxLeverage: 0 });

      const mmr = await marketUtilsTest.getDynamicMmr(
        dataStore.address,
        ethUsdMarket.marketToken,
        decimalToFloat(1_000_000),
        decimalToFloat(20_000)
      );
      expect(mmr).eq(cryptoCfg.maxMmr);
    });

    it("floors at min_mmr for low-leverage positions", async () => {
      const marketUtilsTest = await deployContract("MarketUtilsTest", []);
      await setMmrParams(ethUsdMarket.marketToken, cryptoCfg);

      // 10x leverage ($1M notional / $100k collateral)
      // raw = (10/100) * 0.5% = 0.05% → clamped UP to min_mmr = 0.3%
      const mmr = await marketUtilsTest.getDynamicMmr(
        dataStore.address,
        ethUsdMarket.marketToken,
        decimalToFloat(1_000_000),
        decimalToFloat(100_000)
      );
      expect(mmr).eq(cryptoCfg.minMmr);
    });

    it("equals mmr_tuning at max_leverage (curve endpoint)", async () => {
      const marketUtilsTest = await deployContract("MarketUtilsTest", []);
      await setMmrParams(ethUsdMarket.marketToken, cryptoCfg);

      // 100x leverage ($1M notional / $10k collateral) → currLev == maxLev
      // raw = (100/100) * 0.5% = 0.5% = mmr_tuning
      // not clamped (0.3% ≤ 0.5% ≤ 10%)
      const mmr = await marketUtilsTest.getDynamicMmr(
        dataStore.address,
        ethUsdMarket.marketToken,
        decimalToFloat(1_000_000),
        decimalToFloat(10_000)
      );
      expect(mmr).eq(cryptoCfg.mmrTuning);
    });

    it("scales linearly between floor and endpoint", async () => {
      const marketUtilsTest = await deployContract("MarketUtilsTest", []);
      // Push min_mmr to 0 so we can see raw scaling without the floor clamp
      await setMmrParams(ethUsdMarket.marketToken, { ...cryptoCfg, minMmr: 0 });

      // 75x leverage: raw = (75/100) * 0.5% = 0.375%
      const mmr = await marketUtilsTest.getDynamicMmr(
        dataStore.address,
        ethUsdMarket.marketToken,
        decimalToFloat(1_000_000),
        decimalToFloat(1_000_000).div(75)
      );
      // Expect ~0.375% (allow tiny rounding)
      const expected = percentageToFloat("0.375%");
      const diff = mmr.sub(expected).abs();
      expect(diff).lt(expandDecimals(1, 20)); // < 1e20 (negligible vs 1e30)
    });

    it("caps at max_mmr when tuning pushes rawMmr above max_mmr", async () => {
      const marketUtilsTest = await deployContract("MarketUtilsTest", []);
      // Intentional overshoot: tuning=20% > max_mmr=10%
      await setMmrParams(ethUsdMarket.marketToken, {
        ...cryptoCfg,
        mmrTuning: percentageToFloat("20%"),
      });

      // At 100x (== maxLev), raw = 20%, clamped DOWN to max_mmr = 10%
      const mmr = await marketUtilsTest.getDynamicMmr(
        dataStore.address,
        ethUsdMarket.marketToken,
        decimalToFloat(1_000_000),
        decimalToFloat(10_000)
      );
      expect(mmr).eq(cryptoCfg.maxMmr);
    });
  });
});
