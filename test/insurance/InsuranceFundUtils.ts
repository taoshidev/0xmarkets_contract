import { expect } from "chai";
import hre from "hardhat";

import { deployContract } from "../../utils/deploy";
import { deployFixture } from "../../utils/fixture";
import { handleDeposit } from "../../utils/deposit";
import { grantRole } from "../../utils/role";
import { prices } from "../../utils/prices";
import { expandDecimals, decimalToFloat, percentageToFloat } from "../../utils/math";
import { parseLogs, getEventData } from "../../utils/event";
import * as keys from "../../utils/keys";

const MaxUint256 = hre.ethers.constants.MaxUint256;

describe("InsuranceFundUtils", () => {
  let fixture;
  let wallet, user0;
  let dataStore, eventEmitter, roleStore, insuranceVault, insuranceFundEventUtils;
  let ethUsdMarket, wnt, usdc;
  let testWrapper;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0 } = fixture.accounts);
    ({ dataStore, eventEmitter, roleStore, insuranceVault, insuranceFundEventUtils, ethUsdMarket, wnt, usdc } =
      fixture.contracts);

    // Both event-util libraries are reachable through the inlined call chain:
    // InsuranceFundUtils → MarketUtils.applyDeltaToPoolAmount → MarketEventUtils (external),
    // and InsuranceFundUtils directly emits via InsuranceFundEventUtils.
    const marketEventUtils = await hre.ethers.getContract("MarketEventUtils");
    testWrapper = await deployContract("InsuranceFundUtilsTest", [], {
      libraries: {
        InsuranceFundEventUtils: insuranceFundEventUtils.address,
        MarketEventUtils: marketEventUtils.address,
      },
    });

    // CONTROLLER is checked in three places we hit through the wrapper:
    //   - DataStore writes (applyDeltaToUint, setUint, incrementUint)
    //   - MarketToken.transferOut (deposit path)
    //   - InsuranceVault.transferOut / recordTransferIn / syncTokenBalance
    //   - EventEmitter.emitEventLog*
    // One CONTROLLER grant on the wrapper covers all of them.
    await grantRole(roleStore, testWrapper.address, "CONTROLLER");

    // Seed the LP pool so getPoolValueExcludingUnrealizedPnl returns non-zero.
    // 1000 WETH @ $5000 = $5M long side; 1M USDC = $1M short side; pool = $6M.
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(1_000_000, 6),
      },
    });
  });

  it("getBalance returns 0 by default", async () => {
    expect(await testWrapper.getBalance(dataStore.address, ethUsdMarket.marketToken, wnt.address)).eq(0);
    expect(await testWrapper.getBalance(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);
  });

  it("snapshotEpoch writes pool USD + timestamp and emits EpochReset", async () => {
    const tx = await testWrapper.snapshotEpoch(
      dataStore.address,
      eventEmitter.address,
      ethUsdMarket,
      prices.ethUsdMarket
    );
    const receipt = await tx.wait();
    const block = await hre.ethers.provider.getBlock(receipt.blockNumber);

    const epochValue = await dataStore.getUint(keys.insuranceFundEpochPoolValueKey(ethUsdMarket.marketToken));
    const epochStart = await dataStore.getUint(keys.insuranceFundEpochStartKey(ethUsdMarket.marketToken));

    // ~$6M scaled by 1e30, give or take borrowing accrual / impact pool which
    // are zero in a fresh fixture.
    expect(epochValue).gt(decimalToFloat(5_999_999));
    expect(epochValue).lt(decimalToFloat(6_000_001));
    expect(epochStart).eq(block.timestamp);

    // Confirm event was emitted via EventEmitter (use the project's parseLogs helper)
    const parsed = parseLogs(fixture, receipt);
    const epochEvent = getEventData(parsed, "InsuranceFundEpochReset");
    expect(epochEvent, "InsuranceFundEpochReset event missing").to.exist;
    expect(epochEvent.market.toLowerCase()).eq(ethUsdMarket.marketToken.toLowerCase());
    expect(epochEvent.epochPoolValue).eq(epochValue);
    expect(epochEvent.timestamp).eq(epochStart);
  });

  it("getDrawdownFraction returns 0 when fund is disabled (no snapshot)", async () => {
    const [drawdown, current, snap] = await testWrapper.getDrawdownFraction(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket
    );
    expect(drawdown).eq(0);
    expect(snap).eq(0);
    // current pool value should still be reported even when fund disabled
    expect(current).gt(0);
  });

  it("getDrawdownFraction reflects realized pool drop after snapshot", async () => {
    await testWrapper.snapshotEpoch(dataStore.address, eventEmitter.address, ethUsdMarket, prices.ethUsdMarket);

    // Simulate ~$500k realized PnL outflow by removing 100 WETH from the pool
    // (100 * 5000 = 500k). At a snapshot of ~$6M, drawdown ~= 500k / 6M ~= 8.33%.
    await dataStore.decrementUint(keys.poolAmountKey(ethUsdMarket.marketToken, wnt.address), expandDecimals(100, 18));

    const [drawdown, current, snap] = await testWrapper.getDrawdownFraction(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket
    );

    expect(snap).gt(decimalToFloat(5_999_999));
    expect(current).lt(snap);

    // 500k / 6M ≈ 8.33% — allow a small band for borrowing/impact terms.
    expect(drawdown).gt(percentageToFloat("8%"));
    expect(drawdown).lt(percentageToFloat("9%"));
  });

  it("getDrawdownFraction returns 0 when epoch is stale", async () => {
    await testWrapper.snapshotEpoch(dataStore.address, eventEmitter.address, ethUsdMarket, prices.ethUsdMarket);

    // Pool drop as before
    await dataStore.decrementUint(keys.poolAmountKey(ethUsdMarket.marketToken, wnt.address), expandDecimals(100, 18));

    // Enable stale check at 1 day, then advance time past it
    await dataStore.setUint(keys.INSURANCE_FUND_MAX_EPOCH_AGE, 24 * 60 * 60);
    await hre.network.provider.send("evm_increaseTime", [25 * 60 * 60]);
    await hre.network.provider.send("evm_mine");

    const [drawdown] = await testWrapper.getDrawdownFraction(dataStore.address, ethUsdMarket, prices.ethUsdMarket);
    expect(drawdown).eq(0);
  });

  it("attemptInjectPool no-ops when triggerFactor is uint256.max", async () => {
    await testWrapper.snapshotEpoch(dataStore.address, eventEmitter.address, ethUsdMarket, prices.ethUsdMarket);
    await dataStore.decrementUint(keys.poolAmountKey(ethUsdMarket.marketToken, wnt.address), expandDecimals(100, 18));

    // Default for an unset key is 0, but the "off" sentinel is uint256.max.
    // setUint accepts the max value.
    await dataStore.setUint(keys.insuranceFundDrawdownTriggerFactorKey(ethUsdMarket.marketToken), MaxUint256);

    expect(
      await testWrapper.callStatic.attemptInjectPool(
        dataStore.address,
        eventEmitter.address,
        insuranceVault.address,
        ethUsdMarket,
        prices.ethUsdMarket,
        wnt.address,
        hre.ethers.constants.HashZero
      )
    ).eq(0);
  });

  it("attemptInjectPool no-ops when drawdown is at/below trigger", async () => {
    await testWrapper.snapshotEpoch(dataStore.address, eventEmitter.address, ethUsdMarket, prices.ethUsdMarket);

    // 8.33% drawdown vs 10% trigger ⇒ no inject
    await dataStore.decrementUint(keys.poolAmountKey(ethUsdMarket.marketToken, wnt.address), expandDecimals(100, 18));
    await dataStore.setUint(
      keys.insuranceFundDrawdownTriggerFactorKey(ethUsdMarket.marketToken),
      percentageToFloat("10%")
    );

    expect(
      await testWrapper.callStatic.attemptInjectPool(
        dataStore.address,
        eventEmitter.address,
        insuranceVault.address,
        ethUsdMarket,
        prices.ethUsdMarket,
        wnt.address,
        hre.ethers.constants.HashZero
      )
    ).eq(0);
  });

  it("attemptInjectPool emits Shortfall when reserve bucket is empty", async () => {
    await testWrapper.snapshotEpoch(dataStore.address, eventEmitter.address, ethUsdMarket, prices.ethUsdMarket);

    // Drop pool, set 2% trigger (drawdown ~= 8% > 2%)
    await dataStore.decrementUint(keys.poolAmountKey(ethUsdMarket.marketToken, wnt.address), expandDecimals(100, 18));
    await dataStore.setUint(
      keys.insuranceFundDrawdownTriggerFactorKey(ethUsdMarket.marketToken),
      percentageToFloat("2%")
    );

    const tx = await testWrapper.attemptInjectPool(
      dataStore.address,
      eventEmitter.address,
      insuranceVault.address,
      ethUsdMarket,
      prices.ethUsdMarket,
      wnt.address,
      hre.ethers.constants.HashZero
    );
    const receipt = await tx.wait();
    const parsed = parseLogs(fixture, receipt);
    const shortfall = getEventData(parsed, "InsuranceFundShortfall");
    expect(shortfall, "InsuranceFundShortfall event missing").to.exist;
    expect(shortfall.paid).eq(0);
    expect(shortfall.requested).gt(0);

    // No injection occurred — reserve and pool unchanged
    expect(await dataStore.getUint(keys.insuranceFundBalanceKey(ethUsdMarket.marketToken, wnt.address))).eq(0);
  });

  it("attemptInjectPool injects to threshold when reserve is sufficient", async () => {
    await testWrapper.snapshotEpoch(dataStore.address, eventEmitter.address, ethUsdMarket, prices.ethUsdMarket);
    await dataStore.decrementUint(keys.poolAmountKey(ethUsdMarket.marketToken, wnt.address), expandDecimals(100, 18));
    await dataStore.setUint(
      keys.insuranceFundDrawdownTriggerFactorKey(ethUsdMarket.marketToken),
      percentageToFloat("2%")
    );

    // Pre-fund the vault with 200 WETH and tag the reserve bucket.
    // Drawdown is ~$500k; covering down to 2% requires ~ (500k - 2%*6M) / 5000
    // = (500k - 120k)/5000 = 76 WETH. 200 WETH is plenty.
    const reserveAmount = expandDecimals(200, 18);
    // Mint fresh WETH from the wallet's hardhat-default ETH balance — the
    // fixture only deposits 50 WETH which is below our reserve target.
    await wnt.connect(wallet).deposit({ value: reserveAmount });
    await wnt.connect(wallet).transfer(insuranceVault.address, reserveAmount);
    await insuranceVault.syncTokenBalance(wnt.address);
    await dataStore.setUint(keys.insuranceFundBalanceKey(ethUsdMarket.marketToken, wnt.address), reserveAmount);

    const poolAmountBefore = await dataStore.getUint(keys.poolAmountKey(ethUsdMarket.marketToken, wnt.address));
    const tx = await testWrapper.attemptInjectPool(
      dataStore.address,
      eventEmitter.address,
      insuranceVault.address,
      ethUsdMarket,
      prices.ethUsdMarket,
      wnt.address,
      hre.ethers.constants.HashZero
    );
    await tx.wait();

    const poolAmountAfter = await dataStore.getUint(keys.poolAmountKey(ethUsdMarket.marketToken, wnt.address));
    const reserveAfter = await dataStore.getUint(keys.insuranceFundBalanceKey(ethUsdMarket.marketToken, wnt.address));

    // Pool should have grown; reserve should have shrunk by the same WETH amount.
    expect(poolAmountAfter).gt(poolAmountBefore);
    const injected = poolAmountAfter.sub(poolAmountBefore);
    expect(reserveAfter).eq(reserveAmount.sub(injected));

    // Post-injection drawdown should sit at or below the trigger.
    const [drawdownAfter] = await testWrapper.getDrawdownFraction(dataStore.address, ethUsdMarket, prices.ethUsdMarket);
    expect(drawdownAfter).lte(percentageToFloat("2%"));
  });

  it("deposit moves tokens from MarketToken to vault and increments reserve", async () => {
    const amount = expandDecimals(5, 6); // 5 USDC

    // The MarketToken side of the deposit needs USDC to move out of. The
    // handleDeposit in beforeEach left 1M USDC sitting in ethUsdMarket.
    const vaultUsdcBefore = await usdc.balanceOf(insuranceVault.address);

    await testWrapper.deposit(
      dataStore.address,
      eventEmitter.address,
      insuranceVault.address,
      ethUsdMarket.marketToken,
      usdc.address,
      hre.ethers.constants.HashZero,
      amount
    );

    expect(await usdc.balanceOf(insuranceVault.address)).eq(vaultUsdcBefore.add(amount));
    expect(await dataStore.getUint(keys.insuranceFundBalanceKey(ethUsdMarket.marketToken, usdc.address))).eq(amount);
  });
});
