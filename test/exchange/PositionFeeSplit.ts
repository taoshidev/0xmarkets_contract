import { expect } from "chai";
import { ethers } from "hardhat";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import { getClaimableFeeAmount } from "../../utils/fee";
import * as keys from "../../utils/keys";

describe("Exchange.PositionFeeSplit", () => {
  let fixture;
  let user0;
  let dataStore, ethUsdMarket, wnt;
  let veAlphaReceiver, treasuryReceiver, buybackReceiver;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, wnt } = fixture.contracts);

    veAlphaReceiver = fixture.accounts.user1.address;
    treasuryReceiver = fixture.accounts.user2.address;
    buybackReceiver = fixture.accounts.user3.address;

    await dataStore.setAddress(keys.VEALPHA_FEE_RECEIVER, veAlphaReceiver);
    await dataStore.setAddress(keys.TREASURY_FEE_RECEIVER, treasuryReceiver);
    await dataStore.setAddress(keys.BUYBACK_FEE_RECEIVER, buybackReceiver);

    // 0.05% position fee
    await dataStore.setUint(keys.positionFeeFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 4));
    await dataStore.setUint(keys.positionFeeFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(5, 4));

    // 25% / 15% / 10% split — pool keeps the residual 50%
    await dataStore.setUint(keys.POSITION_FEE_VEALPHA_FACTOR, decimalToFloat(25, 2));
    await dataStore.setUint(keys.POSITION_FEE_TREASURY_FACTOR, decimalToFloat(15, 2));
    await dataStore.setUint(keys.POSITION_FEE_BUYBACK_FACTOR, decimalToFloat(10, 2));

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(500 * 1000, 6),
      },
    });
  });

  it("splits position fees across veAlpha / treasury / buyback receivers and pool", async () => {
    // Open a $200,000 long. Position fee = 200,000 * 0.05% = 100 USD = 0.02 ETH at $5,000.
    // Splits: veAlpha 25 USD, treasury 15 USD, buyback 10 USD, pool 50 USD.
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    // 100 USD / 5000 USD per ETH = 0.02 ETH total fee
    // 25% = 0.005 ETH, 15% = 0.003 ETH, 10% = 0.002 ETH
    expect(await getClaimableFeeAmount(dataStore, ethUsdMarket.marketToken, wnt.address, veAlphaReceiver)).eq(
      expandDecimals(5, 15) // 0.005 ETH
    );
    expect(await getClaimableFeeAmount(dataStore, ethUsdMarket.marketToken, wnt.address, treasuryReceiver)).eq(
      expandDecimals(3, 15) // 0.003 ETH
    );
    expect(await getClaimableFeeAmount(dataStore, ethUsdMarket.marketToken, wnt.address, buybackReceiver)).eq(
      expandDecimals(2, 15) // 0.002 ETH
    );
  });

  it("zero-address receivers are skipped (residual remains in pool)", async () => {
    await dataStore.setAddress(keys.VEALPHA_FEE_RECEIVER, ethers.constants.AddressZero);

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    // veAlpha should be 0 since the address is zero
    expect(await getClaimableFeeAmount(dataStore, ethUsdMarket.marketToken, wnt.address, veAlphaReceiver)).eq(0);
    // treasury and buyback still credit
    expect(await getClaimableFeeAmount(dataStore, ethUsdMarket.marketToken, wnt.address, treasuryReceiver)).eq(
      expandDecimals(3, 15)
    );
    expect(await getClaimableFeeAmount(dataStore, ethUsdMarket.marketToken, wnt.address, buybackReceiver)).eq(
      expandDecimals(2, 15)
    );
  });
});
