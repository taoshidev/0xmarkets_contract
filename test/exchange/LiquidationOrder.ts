import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, getOrderCount, handleOrder } from "../../utils/order";
import { executeLiquidation } from "../../utils/liquidation";
import { grantRole } from "../../utils/role";
import { getAccountPositionCount } from "../../utils/position";
import { getPoolAmount } from "../../utils/market";
import { errorsContract } from "../../utils/error";
import { getEventData } from "../../utils/event";

describe("Exchange.LiquidationOrder", () => {
  let fixture;
  let wallet, user0;
  let roleStore, dataStore, ethUsdMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0 } = fixture.accounts);
    ({ roleStore, dataStore, ethUsdMarket, wnt, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });
  });

  it("executeLiquidation", async () => {
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);

    await handleOrder(fixture, {
      create: {
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(5001, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
      execute: {
        tokens: [wnt.address, usdc.address],
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
    expect(await getOrderCount(dataStore)).eq(0);

    await grantRole(roleStore, wallet.address, "LIQUIDATION_KEEPER");

    await expect(
      executeLiquidation(fixture, {
        account: user0.address,
        market: ethUsdMarket,
        collateralToken: wnt,
        isLong: true,
        minPrices: [expandDecimals(4200, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(4200, 4), expandDecimals(1, 6)],
        gasUsageLabel: "liquidationHandler.executeLiquidation",
      })
    ).to.be.revertedWithCustomError(errorsContract, "PositionShouldNotBeLiquidated");

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
    expect(await getOrderCount(dataStore)).eq(0);

    await executeLiquidation(fixture, {
      account: user0.address,
      market: ethUsdMarket,
      collateralToken: wnt,
      isLong: true,
      minPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)],
      gasUsageLabel: "liquidationHandler.executeLiquidation",
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await getOrderCount(dataStore)).eq(0);
  });

  it("closes an insolvent liquidation without reverting and emits InsolventClose", async () => {
    // Open a position: 10 WETH collateral ($50k at $5k/ETH), $200k size (4x leverage).
    // sizeInTokens = 200k / 5k = 40 ETH.
    await handleOrder(fixture, {
      create: {
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(5001, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
      execute: {
        tokens: [wnt.address, usdc.address],
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
    await grantRole(roleStore, wallet.address, "LIQUIDATION_KEEPER");

    // Push WETH mark price to $3000 (40% drop — within the oracle's 50% max-deviation window).
    // Collateral is denominated in WETH (10 WETH), so its USD value also drops to $30k.
    // PnL = 40 * (3000 - 5000) = -$80k. Post-PnL remaining = 30k − 80k − fees → deeply negative.
    // Position is insolvent → the new code should NOT revert; it should close the position
    // and emit InsolventClose with the unpaid residual as remainingCostUsd.
    const { logs } = await executeLiquidation(fixture, {
      account: user0.address,
      market: ethUsdMarket,
      collateralToken: wnt,
      isLong: true,
      minPrices: [expandDecimals(3000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(3000, 4), expandDecimals(1, 6)],
      gasUsageLabel: "liquidationHandler.executeLiquidation.insolvent",
    });

    // Position is fully closed despite being insolvent.
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await getOrderCount(dataStore)).eq(0);

    // InsolventClose fires for both liquidation and ADL insolvency; consumers that need
    // to distinguish the two join on OrderCreated.orderType via orderKey.
    const insolventClose = getEventData(logs, "InsolventClose");
    expect(insolventClose, "InsolventClose event missing").to.not.be.undefined;
    expect(insolventClose.remainingCostUsd).to.be.gt(0);
  });

  it("seizes all remaining collateral when fees exceed what the position can pay", async () => {
    // Open: 10 WETH collateral ($50k at $5k/ETH), $200k size → 40 ETH long at 4x.
    await handleOrder(fixture, {
      create: {
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(5001, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
      execute: {
        tokens: [wnt.address, usdc.address],
      },
    });

    await grantRole(roleStore, wallet.address, "LIQUIDATION_KEEPER");

    // Snapshot state BEFORE the liquidation so we can measure collateral flow.
    const userWntBefore = await wnt.balanceOf(user0.address);
    const userUsdcBefore = await usdc.balanceOf(user0.address);
    const poolWntBefore = await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address);
    const poolUsdcBefore = await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address);

    // Force insolvency: mark price $3000. Collateral ($30k in WETH) + PnL (−$80k) is
    // deeply negative, so fees can never be fully paid from collateral.
    const { logs } = await executeLiquidation(fixture, {
      account: user0.address,
      market: ethUsdMarket,
      collateralToken: wnt,
      isLong: true,
      minPrices: [expandDecimals(3000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(3000, 4), expandDecimals(1, 6)],
      gasUsageLabel: "liquidationHandler.executeLiquidation.collectAll",
    });

    // Position fully closed — no dust left behind.
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await getOrderCount(dataStore)).eq(0);

    // Insolvency was real: unpaid fees socialized, AND the event records the full
    // positionCollateralAmount that was seized (= the entire position collateral, 10 WETH).
    const insolventClose = getEventData(logs, "InsolventClose");
    expect(insolventClose, "InsolventClose event missing").to.not.be.undefined;
    expect(insolventClose.remainingCostUsd).to.be.gt(0);
    expect(insolventClose.positionCollateralAmount).to.eq(expandDecimals(10, 18));

    // The trader received no collateral refund — everything that could be taken was taken.
    expect(await wnt.balanceOf(user0.address)).to.eq(userWntBefore);
    expect(await usdc.balanceOf(user0.address)).to.eq(userUsdcBefore);

    // Conservation: the trader's 10 WETH did not disappear. It either stayed with the
    // pool (negative PnL → pool keeps the wnt) or flowed to fee receivers. Specifically,
    // since the position is a losing long, the WETH collateral is applied to cover the
    // negative PnL — so the long-token pool balance must strictly increase by 10 WETH
    // minus any amount routed to fee receivers (position fees / keeper / etc.).
    const poolWntAfter = await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address);
    const poolUsdcAfter = await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address);
    const poolWntDelta = poolWntAfter.sub(poolWntBefore);
    const poolUsdcDelta = poolUsdcAfter.sub(poolUsdcBefore);

    // At least some of the 10 WETH flowed to the long-token pool (can be slightly less
    // than 10 WETH if any was diverted to fee receivers as WETH).
    expect(poolWntDelta).to.be.gt(0);
    // Pool WETH inflow + USDC inflow should be positive overall — the pool absorbed
    // collateral value, confirming "we collected what we could".
    expect(poolWntDelta.add(poolUsdcDelta)).to.be.gt(0);
  });
});
