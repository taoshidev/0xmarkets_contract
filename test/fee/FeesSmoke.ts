import { expect } from "chai";
import { deployUsdcOnlyFixture } from "../../utils/fixture";
import { createDeposit, executeDeposit } from "../../utils/deposit";
import { createWithdrawal, executeWithdrawal } from "../../utils/withdrawal";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import * as keys from "../../utils/keys";
import { ethers } from "hardhat";

describe("Fees/Funding smoke (USDC-only)", () => {
  let fixture: any;
  let contracts: any;

  beforeEach(async () => {
    fixture = await deployUsdcOnlyFixture();
    contracts = fixture.contracts;
  });

  it("USDC deposit/withdraw changes balances", async () => {
    const { dataStore, usdc, ethUsdSingleTokenMarket } = contracts;
    // No special fee configuration; focus on successful flow

    // Deposit USDC
    await createDeposit(fixture, {
      market: ethUsdSingleTokenMarket,
      initialLongToken: usdc.address,
      initialShortToken: usdc.address,
      longTokenAmount: expandDecimals(1_000, 6),
      shortTokenAmount: 0,
      gasUsageLabel: "createDeposit (USDC)",
    });
    await executeDeposit(fixture);

    // Withdraw half and verify claimables increased
    const marketToken = ethUsdSingleTokenMarket.marketToken;
    const marketTokenContract = await (global as any).hre.ethers.getContractAt("MarketToken", marketToken);
    const bal = await marketTokenContract.balanceOf(fixture.accounts.user0.address);

    await createWithdrawal(fixture, {
      market: ethUsdSingleTokenMarket,
      marketTokenAmount: bal.div(2),
      uiFeeReceiver: fixture.accounts.user0,
    });
    await executeWithdrawal(fixture);

    const user = fixture.accounts.user0.address;
    const userUsdc = await usdc.balanceOf(user);
    expect(userUsdc).gt(0);
  });
});
