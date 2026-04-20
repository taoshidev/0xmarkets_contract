import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, getOrderCount, handleOrder } from "../../utils/order";
import { executeLiquidation } from "../../utils/liquidation";
import { grantRole } from "../../utils/role";
import { getAccountPositionCount } from "../../utils/position";
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

  it("emits InsolventLiquidation when collateral cannot cover fees + PnL", async () => {
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
    // and emit InsolventLiquidation.
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

    // New event fired with bad-debt metadata; the generic InsolventClose is NOT emitted
    // for liquidation orders (that branch is now ADL-only).
    const insolventLiquidation = getEventData(logs, "InsolventLiquidation");
    expect(insolventLiquidation, "InsolventLiquidation event missing").to.not.be.undefined;
    expect(insolventLiquidation.market).to.eq(ethUsdMarket.marketToken);
    expect(insolventLiquidation.collateralToken).to.eq(wnt.address);
    expect(insolventLiquidation.remainingCostUsd).to.be.gt(0);

    const insolventClose = getEventData(logs, "InsolventClose");
    expect(insolventClose, "InsolventClose should NOT fire on liquidation orders").to.be.undefined;
  });
});
