import { expect } from "chai";
import { ethers } from "hardhat";
import { deployUsdcOnlyFixture } from "../../utils/fixture";
import { createDeposit, executeDeposit, handleDeposit } from "../../utils/deposit";
import { createWithdrawal, executeWithdrawal } from "../../utils/withdrawal";
import { expandDecimals } from "../../utils/math";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

describe("USDC-only Deposits/Withdrawals", () => {
  let fixture: any;
  let user0: any;
  let contracts: any;

  beforeEach(async () => {
    fixture = await deployUsdcOnlyFixture();
    ({ user0 } = fixture.accounts);
    contracts = fixture.contracts;
  });

  it("rejects non-USDC deposit", async () => {
    const { ethUsdMarket } = contracts;

    await expect(
      createDeposit(fixture, {
        market: ethUsdMarket,
        initialLongToken: ethUsdMarket.longToken, // non-USDC (WETH)
        initialShortToken: ethUsdMarket.longToken, // non-USDC (WETH)
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: 0,
        gasUsageLabel: "createDeposit (non-USDC)",
      })
    ).to.be.revertedWithCustomError(contracts.depositHandler, "InvalidDepositToken");
  });

  it("allows USDC deposit and withdrawal on USDC-only market", async () => {
    const { usdc, ethUsdSingleTokenMarket } = contracts;

    // Deposit USDC into single-token market (both long and short tokens are USDC)
    await createDeposit(fixture, {
      market: ethUsdSingleTokenMarket,
      initialLongToken: usdc.address,
      initialShortToken: usdc.address,
      longTokenAmount: expandDecimals(1000, 6),
      shortTokenAmount: 0,
      gasUsageLabel: "createDeposit (USDC)",
    });

    await executeDeposit(fixture, { gasUsageLabel: "executeDeposit (USDC)" });

    // Withdraw some market tokens back to USDC
    const marketToken = await ethers.getContractAt("MarketToken", ethUsdSingleTokenMarket.marketToken);
    const balance = await marketToken.balanceOf(user0.address);

    await createWithdrawal(fixture, {
      market: ethUsdSingleTokenMarket,
      marketTokenAmount: balance.div(2),
      gasUsageLabel: "createWithdrawal (USDC)",
    });

    await executeWithdrawal(fixture, { gasUsageLabel: "executeWithdrawal (USDC)" });

    // Check 6-decimal correctness
    expect(await usdc.decimals()).eq(6);
    const userUsdc = await usdc.balanceOf(user0.address);
    expect(userUsdc.mod(1_000_000)).eq(0);
  });

  it("rejects non-USDC withdrawal on non-USDC market", async () => {
    const { dataStore, usdc, ethUsdMarket } = contracts;

    // Re-enable non-USDC market for this negative test only
    await dataStore.setBool(keys.isMarketDisabledKey(ethUsdMarket.marketToken), false);

    // Provide USDC-only liquidity to the pair market to mint some market tokens for user0
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        initialLongToken: usdc.address,
        initialShortToken: usdc.address,
        longTokenAmount: 0,
        shortTokenAmount: expandDecimals(10_000, 6),
      },
    });

    // Attempt to withdraw from a market that would include non-USDC tokens (WETH/USDC)
    // Directly call handler.createWithdrawal to trigger guard at creation time
    const { withdrawalHandler } = contracts;
    const zero = ethers.constants.AddressZero;
    await expect(
      withdrawalHandler.createWithdrawal(user0.address, {
        receiver: user0.address,
        callbackContract: zero,
        uiFeeReceiver: zero,
        market: ethUsdMarket.marketToken,
        longTokenSwapPath: [],
        shortTokenSwapPath: [],
        marketTokenAmount: 0,
        minLongTokenAmount: 0,
        minShortTokenAmount: 0,
        shouldUnwrapNativeToken: false,
        executionFee: 0,
        callbackGasLimit: 0,
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidWithdrawalMarketTokens");
  });
});
