import { expect } from "chai";
import { deployFixture } from "../../utils/fixture";
import { createDeposit, executeDeposit } from "../../utils/deposit";
import { createWithdrawal, executeWithdrawal } from "../../utils/withdrawal";
import { expandDecimals } from "../../utils/math";

describe("USDC-only Deposits/Withdrawals", () => {
  let fixture: any;
  let user0: any;
  let contracts: any;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    contracts = fixture.contracts;
  });

  it("rejects non-USDC deposit", async () => {
    const { ethUsdMarket, usdc } = contracts;

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
  });
});
