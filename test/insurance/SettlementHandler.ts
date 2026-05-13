import { expect } from "chai";
import hre from "hardhat";

import { deployFixture } from "../../utils/fixture";
import { handleDeposit } from "../../utils/deposit";
import { grantRole } from "../../utils/role";
import { parseLogs, getEventData } from "../../utils/event";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

describe("SettlementHandler", () => {
  let fixture;
  let wallet, user0;
  let dataStore, roleStore, settlementHandler, ethUsdMarket, wnt, usdc;
  let chainlinkPriceFeedProvider;
  let oracleParams;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0 } = fixture.accounts);
    ({ dataStore, roleStore, settlementHandler, ethUsdMarket, wnt, usdc, chainlinkPriceFeedProvider } =
      fixture.contracts);

    // Seed the LP pool so getPoolValueExcludingUnrealizedPnl returns non-zero.
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(1_000_000, 6),
      },
    });

    // Use the chainlink price feed provider for the snapshot's withOraclePrices
    // modifier. The price feeds are already set in the fixture (~$5000 WETH, $1 USDC).
    await dataStore.setAddress(keys.oracleProviderForTokenKey(wnt.address), chainlinkPriceFeedProvider.address);
    await dataStore.setAddress(keys.oracleProviderForTokenKey(usdc.address), chainlinkPriceFeedProvider.address);
    oracleParams = {
      tokens: [wnt.address, usdc.address],
      providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
      data: ["0x", "0x"],
    };

    // ORDER_KEEPER is the snapshotEpoch permission. Grant the deployer wallet
    // for happy-path tests; user0 stays unauthorized to test the rejection.
    await grantRole(roleStore, wallet.address, "ORDER_KEEPER");
  });

  it("snapshots epoch state and emits EpochReset on first call", async () => {
    expect(await dataStore.getUint(keys.insuranceFundEpochPoolValueKey(ethUsdMarket.marketToken))).eq(0);
    expect(await dataStore.getUint(keys.insuranceFundEpochStartKey(ethUsdMarket.marketToken))).eq(0);

    const tx = await settlementHandler.connect(wallet).snapshotEpoch(ethUsdMarket.marketToken, oracleParams);
    const receipt = await tx.wait();
    const block = await hre.ethers.provider.getBlock(receipt.blockNumber);

    const epochValue = await dataStore.getUint(keys.insuranceFundEpochPoolValueKey(ethUsdMarket.marketToken));
    const epochStart = await dataStore.getUint(keys.insuranceFundEpochStartKey(ethUsdMarket.marketToken));

    expect(epochValue).gt(decimalToFloat(5_999_999));
    expect(epochValue).lt(decimalToFloat(6_000_001));
    expect(epochStart).eq(block.timestamp);

    const parsed = parseLogs(fixture, receipt);
    const ev = getEventData(parsed, "InsuranceFundEpochReset");
    expect(ev, "InsuranceFundEpochReset event").to.exist;
    expect(ev.market.toLowerCase()).eq(ethUsdMarket.marketToken.toLowerCase());
    expect(ev.epochPoolValue).eq(epochValue);
  });

  it("reverts when called again within INSURANCE_FUND_EPOCH_LENGTH", async () => {
    // 7 days
    await dataStore.setUint(keys.INSURANCE_FUND_EPOCH_LENGTH, 7 * 24 * 60 * 60);

    await settlementHandler.connect(wallet).snapshotEpoch(ethUsdMarket.marketToken, oracleParams);

    // Immediate re-call (no time advance) must revert with the typed error.
    await expect(
      settlementHandler.connect(wallet).snapshotEpoch(ethUsdMarket.marketToken, oracleParams)
    ).to.be.revertedWithCustomError(errorsContract, "InsuranceFundEpochNotYetElapsed");
  });

  it("allows re-snapshot after INSURANCE_FUND_EPOCH_LENGTH elapses", async () => {
    await dataStore.setUint(keys.INSURANCE_FUND_EPOCH_LENGTH, 7 * 24 * 60 * 60);

    await settlementHandler.connect(wallet).snapshotEpoch(ethUsdMarket.marketToken, oracleParams);
    const firstStart = await dataStore.getUint(keys.insuranceFundEpochStartKey(ethUsdMarket.marketToken));

    // Advance just past one epoch length.
    await hre.network.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
    await hre.network.provider.send("evm_mine");

    await settlementHandler.connect(wallet).snapshotEpoch(ethUsdMarket.marketToken, oracleParams);
    const secondStart = await dataStore.getUint(keys.insuranceFundEpochStartKey(ethUsdMarket.marketToken));

    expect(secondStart).gt(firstStart);
  });

  it("reverts for callers without ORDER_KEEPER role", async () => {
    await expect(
      settlementHandler.connect(user0).snapshotEpoch(ethUsdMarket.marketToken, oracleParams)
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");
  });
});
