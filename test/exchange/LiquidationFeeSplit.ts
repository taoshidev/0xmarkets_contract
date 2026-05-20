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
  let roleStore, dataStore, ethUsdMarket, wnt, usdc, insuranceVault;
  let validatorReceiver;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0 } = fixture.accounts);
    ({ roleStore, dataStore, ethUsdMarket, wnt, usdc, insuranceVault } = fixture.contracts);

    validatorReceiver = fixture.accounts.user1.address;
    await dataStore.setAddress(keys.VALIDATOR_FEE_RECEIVER, validatorReceiver);
    await dataStore.setUint(keys.liquidationFeeFactorKey(ethUsdMarket.marketToken), decimalToFloat(30, 2));
    await dataStore.setUint(keys.LIQUIDATION_FEE_VALIDATOR_FACTOR, decimalToFloat(30, 2));
    await dataStore.setUint(keys.LIQUIDATION_FEE_INSURANCE_FACTOR, decimalToFloat(20, 2));

    await dataStore.setUint(keys.minMmrKey(ethUsdMarket.marketToken), decimalToFloat(20, 2));

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });
  });

  it("splits liquidation fees between validator, insurance fund, and pool on an insolvent close", async () => {
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
      // Price $4500 → PnL -$20k, $30k collateral remaining; fees $60k → 50%
      // partial payment, exercising _distributeInsolventShares scaling.
      minPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)],
      gasUsageLabel: "liquidationHandler.executeLiquidation",
    });

    const validatorBalance = await getClaimableFeeAmount(
      dataStore,
      ethUsdMarket.marketToken,
      wnt.address,
      validatorReceiver
    );
    const insuranceBalance = await dataStore.getUint(
      keys.insuranceFundBalanceKey(ethUsdMarket.marketToken, wnt.address)
    );

    expect(validatorBalance, "validator claimable").gt(0);
    expect(insuranceBalance, "insurance vault bucket").gt(0);
    // 30% / 20% factors → validator/insurance ratio is 3/2 (same scale
    // factor applied to both shares cancels in the ratio).
    expect(validatorBalance.mul(2)).eq(insuranceBalance.mul(3));

    // Vault's physical token balance matches the bookkept reserve.
    expect(await wnt.balanceOf(insuranceVault.address)).eq(insuranceBalance);
  });

  it("zero-address validator receiver is skipped, insurance still receives on liquidation", async () => {
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
      // Price $4500 → PnL -$20k, $30k collateral remaining; fees $60k → 50%
      // partial payment, exercising _distributeInsolventShares scaling.
      minPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)],
      gasUsageLabel: "liquidationHandler.executeLiquidation",
    });

    // validator address is zero → no credit; insurance still credits the vault
    const validatorBalance = await getClaimableFeeAmount(
      dataStore,
      ethUsdMarket.marketToken,
      wnt.address,
      validatorReceiver
    );
    const insuranceBalance = await dataStore.getUint(
      keys.insuranceFundBalanceKey(ethUsdMarket.marketToken, wnt.address)
    );

    expect(validatorBalance).eq(0);
    expect(insuranceBalance).gt(0);
  });
});
