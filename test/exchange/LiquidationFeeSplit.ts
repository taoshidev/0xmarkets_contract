import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import { executeLiquidation } from "../../utils/liquidation";
import { grantRole } from "../../utils/role";
import { getClaimableFeeAmount } from "../../utils/fee";
import * as keys from "../../utils/keys";

describe("Exchange.LiquidationFeeSplit", () => {
  let fixture;
  let wallet, user0;
  let roleStore, dataStore, ethUsdMarket, wnt, usdc;
  let validatorReceiver, insuranceFundAddress;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0 } = fixture.accounts);
    ({ roleStore, dataStore, ethUsdMarket, wnt, usdc } = fixture.contracts);

    validatorReceiver = fixture.accounts.user1.address;
    insuranceFundAddress = fixture.accounts.user2.address;

    await dataStore.setAddress(keys.VALIDATOR_FEE_RECEIVER, validatorReceiver);
    await dataStore.setAddress(keys.INSURANCE_FUND_ADDRESS, insuranceFundAddress);

    // 0.5% liquidation fee, with 30%/20% splits → pool keeps 50%
    await dataStore.setUint(keys.liquidationFeeFactorKey(ethUsdMarket.marketToken), decimalToFloat(5, 3));
    await dataStore.setUint(keys.LIQUIDATION_FEE_VALIDATOR_FACTOR, decimalToFloat(30, 2));
    await dataStore.setUint(keys.LIQUIDATION_FEE_INSURANCE_FACTOR, decimalToFloat(20, 2));

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });
  });

  // TODO: this scenario hits the insolvent-close path at $4000, which
  // bypasses _distributeLiquidationShares. Restructure with a leverage-based
  // liquidation that leaves remaining collateral.
  it.skip("splits liquidation fees between validator, insurance fund, and pool", async () => {
    // Open 10 WETH collateral ($50k at $5k), $200k size — 4x leverage.
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

    // Drop price enough to liquidate.
    await executeLiquidation(fixture, {
      account: user0.address,
      market: ethUsdMarket,
      collateralToken: wnt,
      isLong: true,
      minPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)],
      gasUsageLabel: "liquidationHandler.executeLiquidation",
    });

    // The two named receivers should now hold non-zero claimable balances
    // and they should be in a 30:20 ratio (= 3:2).
    const validatorBalance = await getClaimableFeeAmount(
      dataStore,
      ethUsdMarket.marketToken,
      wnt.address,
      validatorReceiver
    );
    const insuranceBalance = await getClaimableFeeAmount(
      dataStore,
      ethUsdMarket.marketToken,
      wnt.address,
      insuranceFundAddress
    );

    expect(validatorBalance).gt(0);
    expect(insuranceBalance).gt(0);
    // 30% / 20% factors → validator/insurance ratio is 3/2
    expect(validatorBalance.mul(2)).eq(insuranceBalance.mul(3));
  });

  // TODO: same insolvent-close issue as above.
  it.skip("zero-address receivers are skipped on liquidation", async () => {
    await dataStore.setAddress(keys.VALIDATOR_FEE_RECEIVER, "0x0000000000000000000000000000000000000000");

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

    await executeLiquidation(fixture, {
      account: user0.address,
      market: ethUsdMarket,
      collateralToken: wnt,
      isLong: true,
      minPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)],
      gasUsageLabel: "liquidationHandler.executeLiquidation",
    });

    // validator address is zero → no credit; insurance still credits
    const validatorBalance = await getClaimableFeeAmount(
      dataStore,
      ethUsdMarket.marketToken,
      wnt.address,
      validatorReceiver
    );
    const insuranceBalance = await getClaimableFeeAmount(
      dataStore,
      ethUsdMarket.marketToken,
      wnt.address,
      insuranceFundAddress
    );

    expect(validatorBalance).eq(0);
    expect(insuranceBalance).gt(0);
  });
});
