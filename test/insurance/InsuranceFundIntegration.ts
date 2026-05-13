import { expect } from "chai";
import hre from "hardhat";

import { deployFixture } from "../../utils/fixture";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import { expandDecimals, decimalToFloat, percentageToFloat } from "../../utils/math";
import { grantRole } from "../../utils/role";
import { parseLogs, getEventData } from "../../utils/event";
import { prices } from "../../utils/prices";
import * as keys from "../../utils/keys";

// End-to-end verification that the InsuranceFundUtils hooks in
// DecreasePositionCollateralUtils.processCollateral actually fire during a
// real position close:
//   1. fee collection — the per-(market, token) reserve grows by the
//      configured slice of the protocol fee on a normal close.
//   2. injection — when realized drawdown is over the trigger factor,
//      reserves are moved back into the pool at the end of the close.
describe("Insurance Fund integration with processCollateral", () => {
  let fixture;
  let user0, wallet;
  let dataStore, roleStore, insuranceVault, ethUsdMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0 } = fixture.accounts);
    ({ dataStore, roleStore, insuranceVault, ethUsdMarket, wnt, usdc } = fixture.contracts);

    // Wallet (deployer) already has CONTROLLER; user0 doesn't need it.

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(1_000_000, 6),
      },
    });

    // 0.1% position fee so the protocol fee is non-trivial.
    await dataStore.setUint(keys.positionFeeFactorKey(ethUsdMarket.marketToken, true), percentageToFloat("0.1%"));
    await dataStore.setUint(keys.positionFeeFactorKey(ethUsdMarket.marketToken, false), percentageToFloat("0.1%"));
  });

  it("collects position-fee insurance slice into the vault on a close", async () => {
    // Route 25% of the protocol fee into the insurance fund.
    await dataStore.setUint(keys.insuranceFundPositionFeeFactorKey(ethUsdMarket.marketToken), percentageToFloat("25%"));

    // Reserve and physical vault balance start at zero.
    const reserveKey = keys.insuranceFundBalanceKey(ethUsdMarket.marketToken, wnt.address);
    expect(await dataStore.getUint(reserveKey)).eq(0);
    const vaultBefore = await wnt.balanceOf(insuranceVault.address);

    // Open + close a long position. Use a short-token (USDC) collateral so the
    // collateralToken matches a non-WNT path… actually keep it simple and use
    // wnt as collateral — the fee slice is computed in the collateral token,
    // which is the bucket the reserve tracks.
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    const reserveAfter = await dataStore.getUint(reserveKey);
    const vaultAfter = await wnt.balanceOf(insuranceVault.address);

    // Reserve increased — exact amount depends on the fee math and rounding,
    // assert the relationship rather than a hard-coded number. Vault's physical
    // ERC-20 balance must match the reserve bookkeeping (invariant from spec §4.2).
    expect(reserveAfter).gt(0);
    expect(vaultAfter.sub(vaultBefore)).eq(reserveAfter);
  });

  it("fires attemptInjectPool at end of close — injects when drawdown is over threshold", async () => {
    // Take a snapshot so the drawdown comparison has a baseline.
    // We can't call the library directly from a test; the SettlementHandler PR
    // will provide a keeper entrypoint. For this integration test we simulate
    // by writing the epoch keys directly via the deployer's CONTROLLER role.
    // (This is also how the snapshotEpoch tests in InsuranceFundUtils.ts work.)
    //
    // Pool value here is roughly 1000 WETH @ $5000 + 1M USDC = $6M. Snapshot
    // it and then simulate a pool drop large enough to push drawdown over a 2%
    // trigger.
    const epochValue = await dataStore.getUint(keys.insuranceFundEpochPoolValueKey(ethUsdMarket.marketToken));
    expect(epochValue).eq(0); // no snapshot yet

    // Pre-fund the vault and tag the reserve bucket so injection has something to draw.
    const reserveAmount = expandDecimals(50, 18); // 50 WETH ~$250k
    await wnt.connect(wallet).deposit({ value: reserveAmount });
    await wnt.connect(wallet).transfer(insuranceVault.address, reserveAmount);
    await insuranceVault.syncTokenBalance(wnt.address);
    await dataStore.setUint(keys.insuranceFundBalanceKey(ethUsdMarket.marketToken, wnt.address), reserveAmount);

    // Write the snapshot directly (the SettlementHandler PR will replace this
    // with a real keeper call). Snapshot of ~$6M = 6_000_000 * 1e30.
    await dataStore.setUint(keys.insuranceFundEpochPoolValueKey(ethUsdMarket.marketToken), decimalToFloat(6_000_000));
    await dataStore.setUint(keys.insuranceFundEpochStartKey(ethUsdMarket.marketToken), Math.floor(Date.now() / 1000));

    // Configure a 2% drawdown trigger.
    await dataStore.setUint(
      keys.insuranceFundDrawdownTriggerFactorKey(ethUsdMarket.marketToken),
      percentageToFloat("2%")
    );

    // Simulate a 5% pool drop by draining WETH directly: 50 WETH ≈ $250k ≈ 4.16%
    // of the snapshot. Combined with any minor close effects, this is well above
    // the 2% trigger.
    await dataStore.decrementUint(keys.poolAmountKey(ethUsdMarket.marketToken, wnt.address), expandDecimals(50, 18));

    const reserveBefore = await dataStore.getUint(keys.insuranceFundBalanceKey(ethUsdMarket.marketToken, wnt.address));
    expect(reserveBefore).eq(reserveAmount);

    // Open and close a tiny position to drive the close-time hook. The actual
    // PnL here is small; the bulk of the drawdown comes from the manual drain
    // above. The hook at end-of-processCollateral reads the live drawdown and
    // injects.
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(1, 17), // 0.1 WETH
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(1_000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    let injectionFired = false;
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(1_000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        afterExecution: ({ logs }) => {
          const ev = getEventData(logs, "InsuranceFundInjection");
          if (ev) {
            injectionFired = true;
            expect(ev.market.toLowerCase()).eq(ethUsdMarket.marketToken.toLowerCase());
            expect(ev.token.toLowerCase()).eq(wnt.address.toLowerCase());
            expect(ev.amount).gt(0);
          }
        },
      },
    });

    const reserveAfter = await dataStore.getUint(keys.insuranceFundBalanceKey(ethUsdMarket.marketToken, wnt.address));
    expect(injectionFired, "InsuranceFundInjection event should fire").eq(true);
    expect(reserveAfter).lt(reserveBefore);
  });
});
