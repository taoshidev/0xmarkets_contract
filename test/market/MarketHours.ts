import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { handleOrder, OrderType } from "../../utils/order";
import * as keys from "../../utils/keys";
import { setMarketHours, TRADING_DAYS, timeToSeconds } from "../../utils/marketHours";
import hre from "hardhat";

describe("MarketHours", () => {
  let fixture;
  let user0, user1;
  let dataStore, config, ethUsdMarket, wnt, usdc, exchangeRouter, orderHandler;

  // Time constants (seconds since midnight UTC)
  const MARKET_OPEN_TIME = timeToSeconds(9, 0); // 09:00 UTC
  const MARKET_CLOSE_TIME = timeToSeconds(17, 0); // 17:00 UTC

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ dataStore, config, ethUsdMarket, wnt, usdc, exchangeRouter } = fixture.contracts);
    orderHandler = await hre.ethers.getContract("OrderHandler");

    // Setup initial liquidity (0xMarket only accepts USDC for both long and short)
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        initialLongToken: usdc.address,
        initialShortToken: usdc.address,
        longTokenAmount: expandDecimals(10_000_000, 6), // 10M USDC
        shortTokenAmount: expandDecimals(10_000_000, 6), // 10M USDC
      },
    });
  });

  describe("Configuration", () => {
    it("should allow setting market hours configuration", async () => {
      await setMarketHours(
        config,
        ethUsdMarket.marketToken,
        true, // enabled
        MARKET_OPEN_TIME,
        MARKET_CLOSE_TIME,
        TRADING_DAYS.WEEKDAYS
      );

      const isEnabled = await dataStore.getBool(keys.isMarketHoursEnabledKey(ethUsdMarket.marketToken));
      const openTime = await dataStore.getUint(keys.marketOpenTimeKey(ethUsdMarket.marketToken));
      const closeTime = await dataStore.getUint(keys.marketCloseTimeKey(ethUsdMarket.marketToken));
      const tradingDays = await dataStore.getUint(keys.marketTradingDaysKey(ethUsdMarket.marketToken));

      expect(isEnabled).to.be.true;
      expect(openTime).to.equal(MARKET_OPEN_TIME);
      expect(closeTime).to.equal(MARKET_CLOSE_TIME);
      expect(tradingDays).to.equal(TRADING_DAYS.WEEKDAYS);
    });

    it("should reject invalid open time (>= 86400)", async () => {
      await expect(
        setMarketHours(
          config,
          ethUsdMarket.marketToken,
          true,
          86400, // Invalid: must be < 86400
          MARKET_CLOSE_TIME,
          TRADING_DAYS.WEEKDAYS
        )
      ).to.be.rejectedWith("openTime must be < 86400 seconds");
    });

    it("should reject invalid close time (>= 86400)", async () => {
      await expect(
        setMarketHours(
          config,
          ethUsdMarket.marketToken,
          true,
          MARKET_OPEN_TIME,
          86400, // Invalid
          TRADING_DAYS.WEEKDAYS
        )
      ).to.be.rejectedWith("closeTime must be < 86400 seconds");
    });

    it("should reject invalid trading days bitmap (> 0x7F)", async () => {
      await expect(
        setMarketHours(
          config,
          ethUsdMarket.marketToken,
          true,
          MARKET_OPEN_TIME,
          MARKET_CLOSE_TIME,
          0x80 // Invalid: only 7 bits allowed
        )
      ).to.be.rejectedWith("tradingDaysBitmap must be <= 0x7F (7 bits)");
    });
  });

  describe("Market Hours Validation - Weekdays Only", () => {
    beforeEach(async () => {
      // Configure market hours: Monday-Friday, 09:00-17:00 UTC
      await setMarketHours(
        config,
        ethUsdMarket.marketToken,
        true,
        MARKET_OPEN_TIME,
        MARKET_CLOSE_TIME,
        TRADING_DAYS.WEEKDAYS
      );
    });

    it("should allow orders during market hours on a weekday", async () => {
      // Set time to Monday 10:00 UTC
      // Unix epoch (Jan 1, 1970) was Thursday, so we need to find a Monday
      const mondayMorning = await findTimestampForDayAndTime(1, 36000); // Monday, 10:00 UTC
      await time.increaseTo(mondayMorning);

      // Should succeed - 0xMarket uses USDC as collateral
      await handleOrder(fixture, {
        create: {
          account: user0,
          market: ethUsdMarket,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(50_000, 6), // USDC has 6 decimals
          swapPath: [],
          sizeDeltaUsd: decimalToFloat(50_000),
          acceptablePrice: expandDecimals(5050, 12),
          executionFee: expandDecimals(1, 15),
          minOutputAmount: 0,
          orderType: OrderType.MarketIncrease,
          isLong: true,
          shouldUnwrapNativeToken: false,
        },
      });
    });

    it("should reject orders before market opens", async () => {
      // Set time to Monday 08:00 UTC (before 09:00 open)
      const mondayEarly = await findTimestampForDayAndTime(1, 28800); // Monday, 08:00 UTC
      await time.increaseTo(mondayEarly);

      await expect(
        handleOrder(fixture, {
          create: {
            account: user0,
            market: ethUsdMarket,
            initialCollateralToken: usdc,
            initialCollateralDeltaAmount: expandDecimals(50_000, 6), // USDC has 6 decimals
            swapPath: [],
            sizeDeltaUsd: decimalToFloat(50_000),
            acceptablePrice: expandDecimals(5050, 12),
            executionFee: expandDecimals(1, 15),
            minOutputAmount: 0,
            orderType: OrderType.MarketIncrease,
            isLong: true,
            shouldUnwrapNativeToken: false,
          },
        })
      ).to.be.reverted; // MarketNotOpenYet
    });

    it("should reject orders after market closes", async () => {
      // Set time to Monday 18:00 UTC (after 17:00 close)
      const mondayEvening = await findTimestampForDayAndTime(1, 64800); // Monday, 18:00 UTC
      await time.increaseTo(mondayEvening);

      await expect(
        handleOrder(fixture, {
          create: {
            account: user0,
            market: ethUsdMarket,
            initialCollateralToken: usdc,
            initialCollateralDeltaAmount: expandDecimals(50_000, 6), // USDC has 6 decimals
            swapPath: [],
            sizeDeltaUsd: decimalToFloat(50_000),
            acceptablePrice: expandDecimals(5050, 12),
            executionFee: expandDecimals(1, 15),
            minOutputAmount: 0,
            orderType: OrderType.MarketIncrease,
            isLong: true,
            shouldUnwrapNativeToken: false,
          },
        })
      ).to.be.reverted; // MarketAlreadyClosed
    });

    it("should reject orders on weekends (Saturday)", async () => {
      // Set time to Saturday 12:00 UTC
      const saturday = await findTimestampForDayAndTime(6, 43200); // Saturday, 12:00 UTC
      await time.increaseTo(saturday);

      await expect(
        handleOrder(fixture, {
          create: {
            account: user0,
            market: ethUsdMarket,
            initialCollateralToken: usdc,
            initialCollateralDeltaAmount: expandDecimals(50_000, 6), // USDC has 6 decimals
            swapPath: [],
            sizeDeltaUsd: decimalToFloat(50_000),
            acceptablePrice: expandDecimals(5050, 12),
            executionFee: expandDecimals(1, 15),
            minOutputAmount: 0,
            orderType: OrderType.MarketIncrease,
            isLong: true,
            shouldUnwrapNativeToken: false,
          },
        })
      ).to.be.reverted; // MarketClosedForDay
    });

    it("should reject orders on weekends (Sunday)", async () => {
      // Set time to Sunday 12:00 UTC
      const sunday = await findTimestampForDayAndTime(0, 43200); // Sunday, 12:00 UTC
      await time.increaseTo(sunday);

      await expect(
        handleOrder(fixture, {
          create: {
            account: user0,
            market: ethUsdMarket,
            initialCollateralToken: wnt,
            initialCollateralDeltaAmount: expandDecimals(10, 18),
            swapPath: [],
            sizeDeltaUsd: decimalToFloat(50_000),
            acceptablePrice: expandDecimals(5050, 12),
            executionFee: expandDecimals(1, 15),
            minOutputAmount: 0,
            orderType: OrderType.MarketIncrease,
            isLong: true,
            shouldUnwrapNativeToken: false,
          },
        })
      ).to.be.reverted; // MarketClosedForDay
    });
  });

  describe("Market Hours - Overnight Trading", () => {
    it("should handle markets that close before they open (e.g., 22:00-02:00)", async () => {
      // Configure market: 22:00 UTC open, 02:00 UTC close (next day)
      const overnightOpen = timeToSeconds(22, 0); // 22:00 UTC
      const overnightClose = timeToSeconds(2, 0); // 02:00 UTC

      await setMarketHours(
        config,
        ethUsdMarket.marketToken,
        true,
        overnightOpen,
        overnightClose,
        TRADING_DAYS.ALL_DAYS
      );

      // Test at 23:00 UTC (should be open)
      const lateNight = await findTimestampForDayAndTime(1, 82800); // Monday, 23:00 UTC
      await time.increaseTo(lateNight);

      await handleOrder(fixture, {
        create: {
          account: user0,
          market: ethUsdMarket,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(50_000, 6), // USDC has 6 decimals
          swapPath: [],
          sizeDeltaUsd: decimalToFloat(50_000),
          acceptablePrice: expandDecimals(5100, 12), // Increased to allow for price movement
          executionFee: expandDecimals(1, 15),
          minOutputAmount: 0,
          orderType: OrderType.MarketIncrease,
          isLong: true,
          shouldUnwrapNativeToken: false,
        },
      });

      // Test at 01:00 UTC (should be open)
      const earlyMorning = await findTimestampForDayAndTime(2, 3600); // Tuesday, 01:00 UTC
      await time.increaseTo(earlyMorning);

      await handleOrder(fixture, {
        create: {
          account: user1,
          market: ethUsdMarket,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(50_000, 6), // USDC has 6 decimals
          swapPath: [],
          sizeDeltaUsd: decimalToFloat(50_000),
          acceptablePrice: expandDecimals(5100, 12), // Increased to allow for price movement
          executionFee: expandDecimals(1, 15),
          minOutputAmount: 0,
          orderType: OrderType.MarketIncrease,
          isLong: true,
          shouldUnwrapNativeToken: false,
        },
      });

      // Test at 12:00 UTC (should be closed)
      const midday = await findTimestampForDayAndTime(2, 43200); // Tuesday, 12:00 UTC
      await time.increaseTo(midday);

      await expect(
        handleOrder(fixture, {
          create: {
            account: user0,
            market: ethUsdMarket,
            initialCollateralToken: wnt,
            initialCollateralDeltaAmount: expandDecimals(10, 18),
            swapPath: [],
            sizeDeltaUsd: decimalToFloat(50_000),
            acceptablePrice: expandDecimals(5050, 12),
            executionFee: expandDecimals(1, 15),
            minOutputAmount: 0,
            orderType: OrderType.MarketIncrease,
            isLong: true,
            shouldUnwrapNativeToken: false,
          },
        })
      ).to.be.reverted; // MarketAlreadyClosed
    });
  });

  describe("Market Hours - Disabled", () => {
    it("should allow orders at any time when market hours are disabled", async () => {
      // Configure market hours but set enabled=false (crypto market behavior)
      await setMarketHours(
        config,
        ethUsdMarket.marketToken,
        false, // disabled
        MARKET_OPEN_TIME,
        MARKET_CLOSE_TIME,
        TRADING_DAYS.WEEKDAYS
      );

      // Try on Sunday at 3 AM (would normally be closed)
      const sundayMorning = await findTimestampForDayAndTime(0, 10800); // Sunday, 03:00 UTC
      await time.increaseTo(sundayMorning);

      // Should succeed because market hours are disabled
      await handleOrder(fixture, {
        create: {
          account: user0,
          market: ethUsdMarket,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(50_000, 6), // USDC has 6 decimals
          swapPath: [],
          sizeDeltaUsd: decimalToFloat(50_000),
          acceptablePrice: expandDecimals(5050, 12),
          executionFee: expandDecimals(1, 15),
          minOutputAmount: 0,
          orderType: OrderType.MarketIncrease,
          isLong: true,
          shouldUnwrapNativeToken: false,
        },
      });
    });
  });

  describe("Market Hours - Custom Trading Days", () => {
    it("should respect custom trading days (Monday only)", async () => {
      await setMarketHours(
        config,
        ethUsdMarket.marketToken,
        true,
        0, // Open at midnight
        86399, // Close at 23:59:59
        TRADING_DAYS.MONDAY // Only Monday
      );

      // Monday should work
      const monday = await findTimestampForDayAndTime(1, 43200); // Monday, 12:00 UTC
      await time.increaseTo(monday);

      await handleOrder(fixture, {
        create: {
          account: user0,
          market: ethUsdMarket,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(50_000, 6), // USDC has 6 decimals
          swapPath: [],
          sizeDeltaUsd: decimalToFloat(50_000),
          acceptablePrice: expandDecimals(5050, 12),
          executionFee: expandDecimals(1, 15),
          minOutputAmount: 0,
          orderType: OrderType.MarketIncrease,
          isLong: true,
          shouldUnwrapNativeToken: false,
        },
      });

      // Tuesday should fail
      const tuesday = await findTimestampForDayAndTime(2, 43200); // Tuesday, 12:00 UTC
      await time.increaseTo(tuesday);

      await expect(
        handleOrder(fixture, {
          create: {
            account: user0,
            market: ethUsdMarket,
            initialCollateralToken: wnt,
            initialCollateralDeltaAmount: expandDecimals(10, 18),
            swapPath: [],
            sizeDeltaUsd: decimalToFloat(50_000),
            acceptablePrice: expandDecimals(5050, 12),
            executionFee: expandDecimals(1, 15),
            minOutputAmount: 0,
            orderType: OrderType.MarketIncrease,
            isLong: true,
            shouldUnwrapNativeToken: false,
          },
        })
      ).to.be.reverted; // MarketClosedForDay
    });
  });
});

/**
 * Helper function to find a timestamp for a specific day of week and time
 * @param dayOfWeek 0=Sunday, 1=Monday, ..., 6=Saturday
 * @param timeOfDay seconds since midnight UTC (0-86399)
 * @returns timestamp
 */
async function findTimestampForDayAndTime(dayOfWeek: number, timeOfDay: number): Promise<number> {
  const currentTime = await time.latest();
  const SECONDS_IN_DAY = 86400;

  // Calculate current day of week (Unix epoch Jan 1, 1970 was Thursday = 4)
  const currentDayOfWeek = (Math.floor(currentTime / SECONDS_IN_DAY) + 4) % 7;

  // Calculate days to add to reach target day
  let daysToAdd = dayOfWeek - currentDayOfWeek;
  if (daysToAdd < 0) {
    daysToAdd += 7; // Go to next week
  }

  // Calculate target timestamp
  const currentTimeOfDay = currentTime % SECONDS_IN_DAY;
  const targetTimestamp = currentTime - currentTimeOfDay + daysToAdd * SECONDS_IN_DAY + timeOfDay;

  return targetTimestamp;
}
