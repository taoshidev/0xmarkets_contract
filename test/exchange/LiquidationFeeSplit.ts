import { expect } from "chai";
import { ethers } from "hardhat";

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
  let insuranceFund, validatorReceiver, buybackReceiver;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0 } = fixture.accounts);
    ({ roleStore, dataStore, ethUsdMarket, wnt, usdc } = fixture.contracts);

    [insuranceFund, validatorReceiver, buybackReceiver] = (await ethers.getSigners()).slice(-3);

    await dataStore.setAddress(keys.INSURANCE_FUND_ADDRESS, insuranceFund.address);
    await dataStore.setAddress(keys.VALIDATOR_FEE_RECEIVER, validatorReceiver.address);
    await dataStore.setAddress(keys.BUYBACK_FEE_RECEIVER, buybackReceiver.address);
    await dataStore.setUint(keys.LIQUIDATION_FEE_RECEIVER_FACTOR, decimalToFloat(5, 2)); // 5%
    await dataStore.setUint(keys.LIQUIDATION_FEE_INSURANCE_FACTOR, decimalToFloat(5, 1)); // 50%
    await dataStore.setUint(keys.LIQUIDATION_FEE_VALIDATOR_FACTOR, decimalToFloat(2, 1)); // 20%
    await dataStore.setUint(keys.LIQUIDATION_FEE_BUYBACK_FACTOR, decimalToFloat(2, 1)); // 20%

    // Liquidation fee = 0.5% of size in USD (matches Hardhat fixture default).
    await dataStore.setUint(keys.liquidationFeeFactorKey(ethUsdMarket.marketToken), decimalToFloat(5, 3));

    await handleDeposit(fixture, {
      create: { market: ethUsdMarket, longTokenAmount: expandDecimals(1000, 18) },
    });

    await grantRole(roleStore, wallet.address, "LIQUIDATION_KEEPER");
  });

  it("splits the liquidation fee across insurance / validator / buyback in proportion", async () => {
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
      execute: { tokens: [wnt.address, usdc.address] },
    });

    await executeLiquidation(fixture, {
      account: user0.address,
      market: ethUsdMarket,
      collateralToken: wnt,
      isLong: true,
      minPrices: [expandDecimals(4030, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(4030, 4), expandDecimals(1, 6)],
      gasUsageLabel: "liquidationHandler.executeLiquidation.4way",
    });

    const insuranceClaim = await getClaimableFeeAmount(
      dataStore,
      ethUsdMarket.marketToken,
      wnt.address,
      insuranceFund.address
    );
    const validatorClaim = await getClaimableFeeAmount(
      dataStore,
      ethUsdMarket.marketToken,
      wnt.address,
      validatorReceiver.address
    );
    const buybackClaim = await getClaimableFeeAmount(
      dataStore,
      ethUsdMarket.marketToken,
      wnt.address,
      buybackReceiver.address
    );

    // All three new receivers received non-zero balances.
    expect(insuranceClaim).to.be.gt(0);
    expect(validatorClaim).to.be.gt(0);
    expect(buybackClaim).to.be.gt(0);

    expect(validatorClaim).to.eq(buybackClaim);

    expect(insuranceClaim).to.eq(validatorClaim.mul(5).div(2));
  });

  it("skips a share when its receiver address is unset", async () => {
    await dataStore.setAddress(keys.VALIDATOR_FEE_RECEIVER, ethers.constants.AddressZero);

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
      execute: { tokens: [wnt.address, usdc.address] },
    });

    await executeLiquidation(fixture, {
      account: user0.address,
      market: ethUsdMarket,
      collateralToken: wnt,
      isLong: true,
      minPrices: [expandDecimals(4030, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(4030, 4), expandDecimals(1, 6)],
      gasUsageLabel: "liquidationHandler.executeLiquidation.zeroValidator",
    });

    const validatorClaim = await getClaimableFeeAmount(
      dataStore,
      ethUsdMarket.marketToken,
      wnt.address,
      validatorReceiver.address
    );
    const insuranceClaim = await getClaimableFeeAmount(
      dataStore,
      ethUsdMarket.marketToken,
      wnt.address,
      insuranceFund.address
    );
    const buybackClaim = await getClaimableFeeAmount(
      dataStore,
      ethUsdMarket.marketToken,
      wnt.address,
      buybackReceiver.address
    );

    expect(validatorClaim).to.eq(0);
    // Insurance and buyback still accrued normally.
    expect(insuranceClaim).to.be.gt(0);
    expect(buybackClaim).to.be.gt(0);
  });
});
