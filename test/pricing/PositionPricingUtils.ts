import { expect } from "chai";
import hre from "hardhat";

import { deployContract } from "../../utils/deploy";
import { deployFixture } from "../../utils/fixture";
import { handleDeposit } from "../../utils/deposit";
import { prices } from "../../utils/prices";
import { expandDecimals, decimalToFloat, percentageToFloat } from "../../utils/math";
import * as keys from "../../utils/keys";

describe("PositionPricingUtils insurance fund extensions", () => {
  let fixture;
  let wallet;
  let dataStore, referralStorage, ethUsdMarket, usdc;
  let pricingTest;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet } = fixture.accounts);
    ({ dataStore, referralStorage, ethUsdMarket, usdc } = fixture.contracts);

    // Library functions are internal — expose them through the test wrapper.
    pricingTest = await deployContract("PositionPricingUtilsTest", []);

    // Seed the pool so positionFeeFactor reads have a configured market.
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(1_000_000, 6),
      },
    });
  });

  describe("getLiquidationFees", () => {
    beforeEach(async () => {
      // 1% liquidation fee so liquidationFeeAmount > 0
      await dataStore.setUint(keys.liquidationFeeFactorKey(ethUsdMarket.marketToken), percentageToFloat("1%"));
    });

    it("populates zero insurance fields by default", async () => {
      const fees = await pricingTest.getLiquidationFees(
        dataStore.address,
        ethUsdMarket.marketToken,
        decimalToFloat(100_000),
        prices.usdc
      );

      expect(fees.liquidationFeeAmount).gt(0);
      expect(fees.liquidationFeeInsuranceFactor).eq(0);
      expect(fees.liquidationFeeAmountForInsurance).eq(0);
    });

    it("populates insurance fields when factor is set", async () => {
      await dataStore.setUint(keys.insuranceFundFeeFactorKey(ethUsdMarket.marketToken), percentageToFloat("40%"));

      const fees = await pricingTest.getLiquidationFees(
        dataStore.address,
        ethUsdMarket.marketToken,
        decimalToFloat(100_000),
        prices.usdc
      );

      expect(fees.liquidationFeeInsuranceFactor).eq(percentageToFloat("40%"));
      // applyFactor(amount, 40%) — exact tokens depend on collateral price rounding;
      // assert the relationship rather than the magnitude.
      const expected = fees.liquidationFeeAmount.mul(percentageToFloat("40%")).div(decimalToFloat(1));
      expect(fees.liquidationFeeAmountForInsurance).eq(expected);
    });
  });

  describe("getPositionFeesAfterReferral", () => {
    beforeEach(async () => {
      // 0.1% position fee so a non-trivial protocolFeeAmount lands in the struct.
      await dataStore.setUint(keys.positionFeeFactorKey(ethUsdMarket.marketToken, true), percentageToFloat("0.1%"));
      await dataStore.setUint(keys.positionFeeFactorKey(ethUsdMarket.marketToken, false), percentageToFloat("0.1%"));
    });

    it("leaves positionFeeAmountForPool untouched when insurance factor is unset", async () => {
      const fees = await pricingTest.getPositionFeesAfterReferral(
        dataStore.address,
        referralStorage.address,
        prices.usdc,
        false, // forPositiveImpact
        wallet.address,
        ethUsdMarket.marketToken,
        decimalToFloat(100_000)
      );

      expect(fees.positionFeeInsuranceFactor).eq(0);
      expect(fees.positionFeeAmountForInsurance).eq(0);
      // protocolFeeAmount = positionFeeAmount (no referral, no pro discount)
      // positionFeeAmountForPool = protocol - feeReceiver - secondary - 0
      expect(fees.positionFeeAmountForPool).eq(
        fees.protocolFeeAmount.sub(fees.feeReceiverAmount).sub(fees.secondaryFeeReceiverAmount)
      );
    });

    it("redirects a slice of protocolFeeAmount to insurance and reduces pool share", async () => {
      await dataStore.setUint(
        keys.insuranceFundPositionFeeFactorKey(ethUsdMarket.marketToken),
        percentageToFloat("25%")
      );

      const fees = await pricingTest.getPositionFeesAfterReferral(
        dataStore.address,
        referralStorage.address,
        prices.usdc,
        false,
        wallet.address,
        ethUsdMarket.marketToken,
        decimalToFloat(100_000)
      );

      expect(fees.positionFeeInsuranceFactor).eq(percentageToFloat("25%"));
      const expectedInsurance = fees.protocolFeeAmount.mul(percentageToFloat("25%")).div(decimalToFloat(1));
      expect(fees.positionFeeAmountForInsurance).eq(expectedInsurance);

      // Pool's share must shrink by exactly the insurance slice — no double counting,
      // no underflow. This is the invariant that prevents the InsuranceVault transfer
      // and the pool credit in processCollateral from over/under-counting the same tokens.
      expect(fees.positionFeeAmountForPool).eq(
        fees.protocolFeeAmount
          .sub(fees.feeReceiverAmount)
          .sub(fees.secondaryFeeReceiverAmount)
          .sub(fees.positionFeeAmountForInsurance)
      );
    });
  });
});
