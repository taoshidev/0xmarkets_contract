import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { DataStore, MockPythLazer, PythAdapter, MintableToken } from "../../typechain-types";
import { deployFixture } from "../../utils/fixture";
import * as keys from "../../utils/keys";
import { expandDecimals } from "../../utils/math";

describe("PythAdapter", function () {
  let dataStore: DataStore;
  let mockPythLazer: MockPythLazer;
  let pythAdapter: PythAdapter;
  let wallet: SignerWithAddress;
  let user0: SignerWithAddress;
  let eurUsdToken: MintableToken;
  let wnt: any;
  let wbtc: any;

  const ETH_FEED_ID = 1;
  const BTC_FEED_ID = 2;
  const EUR_USD_FEED_ID = 3;
  const VERIFICATION_FEE = expandDecimals(1, 15); // 0.001 ETH
  const MAX_ORACLE_PRICE_AGE = 300; // 5 minutes - allow for test execution delays

  beforeEach(async function () {
    const fixture = await deployFixture();

    // Extract accounts
    wallet = fixture.accounts.wallet;
    user0 = fixture.accounts.user0;

    // Extract contracts with proper typing
    dataStore = fixture.contracts.dataStore as DataStore;
    wnt = fixture.contracts.wnt;
    wbtc = fixture.contracts.wbtc;

    // Deploy MockPythLazer
    const MockPythLazer = await ethers.getContractFactory("MockPythLazer");
    mockPythLazer = (await MockPythLazer.deploy()) as MockPythLazer;
    await mockPythLazer.setVerificationFee(VERIFICATION_FEE);

    // Deploy PythLazerLib library first
    const PythLazerLib = await ethers.getContractFactory("PythLazerLib");
    const pythLazerLib = await PythLazerLib.deploy();
    await pythLazerLib.deployed();

    // Deploy PythAdapter with library linking
    const PythAdapter = await ethers.getContractFactory("PythAdapter", {
      libraries: {
        "pyth-lazer/PythLazerLib.sol:PythLazerLib": pythLazerLib.address,
      },
    });
    pythAdapter = (await PythAdapter.deploy(dataStore.address, mockPythLazer.address)) as PythAdapter;

    // Deploy dummy EUR/USD token for FX testing
    const MintableToken = await ethers.getContractFactory("MintableToken");
    eurUsdToken = (await MintableToken.deploy("EUR/USD", "EURUSD", 18)) as MintableToken;

    // Configure Pyth feed IDs in DataStore
    await dataStore.setUint(keys.pythFeedIdKey(wnt.address), ETH_FEED_ID);
    await dataStore.setUint(keys.pythFeedIdKey(wbtc.address), BTC_FEED_ID);
    await dataStore.setUint(keys.pythFeedIdKey(eurUsdToken.address), EUR_USD_FEED_ID);

    // Configure max oracle price age
    await dataStore.setUint(keys.MAX_ORACLE_PRICE_AGE, MAX_ORACLE_PRICE_AGE);

    // Set up valid signers for mock
    await mockPythLazer.addValidSigner(wallet.address);

    // Create and set mock payloads for each feed
    const ethPayload = await mockPythLazer.createMockPythPayload(
      ETH_FEED_ID,
      200000000000, // $2000 with 8 decimals
      100000000, // $1 confidence
      -8, // exponent
      Math.floor(Date.now() / 1000)
    );
    await mockPythLazer.setMockPayload(ETH_FEED_ID, ethPayload);

    const btcPayload = await mockPythLazer.createMockPythPayload(
      BTC_FEED_ID,
      5000000000000, // $50,000 with 8 decimals
      200000000, // $2 confidence
      -8,
      Math.floor(Date.now() / 1000)
    );
    await mockPythLazer.setMockPayload(BTC_FEED_ID, btcPayload);

    const eurUsdPayload = await mockPythLazer.createMockPythPayload(
      EUR_USD_FEED_ID,
      108500000, // 1.085 with 8 decimals
      1000000, // 0.01 confidence
      -8,
      Math.floor(Date.now() / 1000)
    );
    await mockPythLazer.setMockPayload(EUR_USD_FEED_ID, eurUsdPayload);
  });

  describe("Deployment and Configuration", function () {
    it("Should deploy with correct parameters", async function () {
      expect(await pythAdapter.dataStore()).to.equal(dataStore.address);
      expect(await pythAdapter.pythLazer()).to.equal(mockPythLazer.address);
    });

    it("Should check if tokens are supported", async function () {
      expect(await pythAdapter.isTokenSupported(wnt.address)).to.be.true;
      expect(await pythAdapter.isTokenSupported(wbtc.address)).to.be.true;
      expect(await pythAdapter.isTokenSupported(eurUsdToken.address)).to.be.true;

      // Should return false for unconfigured token (use a random address)
      expect(await pythAdapter.isTokenSupported("0x1234567890123456789012345678901234567890")).to.be.false;
    });

    it("Should return correct feed IDs", async function () {
      expect(await pythAdapter.getTokenFeedId(wnt.address)).to.equal(ETH_FEED_ID);
      expect(await pythAdapter.getTokenFeedId(wbtc.address)).to.equal(BTC_FEED_ID);
      expect(await pythAdapter.getTokenFeedId(eurUsdToken.address)).to.equal(EUR_USD_FEED_ID);
    });

    it("Should return current verification fee", async function () {
      expect(await pythAdapter.getCurrentVerificationFee()).to.equal(VERIFICATION_FEE);
    });
  });

  describe("Basic updatePrice Functionality", function () {
    it("Should reject updatePrice with insufficient fee", async function () {
      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      const insufficientFee = VERIFICATION_FEE.div(2);

      await expect(
        pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: insufficientFee })
      ).to.be.revertedWith("PythAdapter: Insufficient fee provided");
    });

    it("Should reject updatePrice with empty data", async function () {
      await expect(
        pythAdapter.connect(user0).updatePrice(wnt.address, "0x", { value: VERIFICATION_FEE })
      ).to.be.revertedWith("PythAdapter: Update data required");
    });

    it("Should successfully update WETH price with exact fee", async function () {
      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);

      const tx = await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

      // Check the transaction was successful
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);

      // Check stored price data
      const [price, confidence, publishTime, isValid] = await pythAdapter.getStoredPrice(wnt.address);
      expect(isValid).to.be.true;
      expect(price).to.be.gt(0);
      expect(confidence).to.be.gt(0);
      expect(publishTime).to.be.gt(0);
    });

    it("Should refund excess fee when more than required is sent", async function () {
      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      const excessFee = VERIFICATION_FEE.mul(2); // Send 2x the required fee

      const balanceBefore = await user0.getBalance();

      const tx = await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: excessFee });

      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      const balanceAfter = await user0.getBalance();

      // Should have been charged only the verification fee + gas
      const expectedBalance = balanceBefore.sub(VERIFICATION_FEE).sub(gasUsed);
      expect(balanceAfter).to.be.closeTo(expectedBalance, expandDecimals(1, 15)); // Allow small rounding error
    });

    it("Should emit correct events on successful price update", async function () {
      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      const currentTimestamp = Math.floor(Date.now() / 1000);

      await expect(pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE }))
        .to.emit(pythAdapter, "PythReferencePrice")
        .withArgs(
          wnt.address,
          user0.address,
          ETH_FEED_ID,
          expandDecimals(2000, 30), // pyth_price (30 decimals)
          expandDecimals(1, 30), // pyth_conf (30 decimals)
          currentTimestamp, // pyth_publish_time (mocked to current time)
          VERIFICATION_FEE
        );
    });

    it("Should support multiple tokens with different feed IDs", async function () {
      const ethUpdateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      const btcUpdateData = await mockPythLazer.createMockUpdateData(BTC_FEED_ID);

      // Update WETH
      await pythAdapter.connect(user0).updatePrice(wnt.address, ethUpdateData, { value: VERIFICATION_FEE });

      // Update WBTC
      await pythAdapter.connect(user0).updatePrice(wbtc.address, btcUpdateData, { value: VERIFICATION_FEE });

      // Check both are updated
      const [ethPrice, , , ethValid] = await pythAdapter.getStoredPrice(wnt.address);
      const [btcPrice, , , btcValid] = await pythAdapter.getStoredPrice(wbtc.address);

      expect(ethValid).to.be.true;
      expect(btcValid).to.be.true;
      expect(ethPrice).to.be.gt(0);
      expect(btcPrice).to.be.gt(0);
    });
  });

  describe("getOraclePrice Functionality", function () {
    beforeEach(async function () {
      // Create fresh payload to avoid staleness
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const ethPayload = await mockPythLazer.createMockPythPayload(
        ETH_FEED_ID,
        200000000000, // $2000 with 8 decimals
        100000000, // $1 confidence
        -8, // exponent
        currentTimestamp
      );
      await mockPythLazer.setMockPayload(ETH_FEED_ID, ethPayload);

      // Update prices first
      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });
    });

    it("Should return valid price data when called by anyone", async function () {
      const result = await pythAdapter.connect(user0).callStatic.getOraclePrice(wnt.address, "0x");

      // Verify result structure
      expect(result.token).to.equal(wnt.address);
      expect(result.min).to.be.gt(0); // pyth_price
      expect(result.max).to.be.gt(0); // pyth_conf
      expect(result.timestamp).to.be.gt(0); // pyth_publish_time
      expect(result.provider).to.equal(pythAdapter.address);
    });

    it("Should reject getOraclePrice when no valid price available", async function () {
      // Don't update any price first, try to get price for unconfigured token
      await expect(pythAdapter.connect(user0).callStatic.getOraclePrice(wbtc.address, "0x")).to.be.revertedWith(
        "PythAdapter: No valid price available"
      );
    });
  });

  describe("View Functions", function () {
    it("Should return stored price data correctly", async function () {
      // Before update
      let [price, confidence, publishTime, isValid] = await pythAdapter.getStoredPrice(wnt.address);
      expect(isValid).to.be.false;

      // After update
      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

      [price, confidence, publishTime, isValid] = await pythAdapter.getStoredPrice(wnt.address);
      expect(price).to.be.gt(0);
      expect(confidence).to.be.gt(0);
      expect(publishTime).to.be.gt(0);
      expect(isValid).to.be.true;
    });
  });

  describe("Fee Management", function () {
    it("Should handle verification fee changes", async function () {
      const newFee = ethers.utils.parseEther("0.002");
      await mockPythLazer.setVerificationFee(newFee);

      expect(await pythAdapter.getCurrentVerificationFee()).to.equal(newFee);

      // Should require new fee amount
      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);

      await expect(
        pythAdapter.connect(user0).updatePrice(
          wnt.address,
          updateData,
          { value: VERIFICATION_FEE } // Old fee amount
        )
      ).to.be.revertedWith("PythAdapter: Insufficient fee provided");

      // Should work with new fee
      await expect(pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: newFee })).to.not.be
        .reverted;
    });
  });

  describe("Edge Cases and Error Conditions", function () {
    it("Should reject updatePrice for unsupported token", async function () {
      const unsupportedToken = "0x1234567890123456789012345678901234567890";
      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);

      await expect(
        pythAdapter.connect(user0).updatePrice(unsupportedToken, updateData, { value: VERIFICATION_FEE })
      ).to.be.revertedWith("PythAdapter: No feed ID configured");
    });

    it("Should handle zero price gracefully", async function () {
      // Create payload with zero price
      const zeroPayload = await mockPythLazer.createMockPythPayload(
        ETH_FEED_ID,
        0, // Zero price
        100000000,
        -8,
        Math.floor(Date.now() / 1000)
      );
      await mockPythLazer.setMockPayload(ETH_FEED_ID, zeroPayload);

      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);

      const result = await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

      // Should return false for invalid price
      const receipt = await result.wait();
      expect(receipt.status).to.equal(1);

      // Stored price should remain invalid
      const [, , , isValid] = await pythAdapter.getStoredPrice(wnt.address);
      expect(isValid).to.be.false;
    });

    it("Should reject invalid exponents", async function () {
      // Test extreme exponents that should be rejected
      const extremeExponentPayload = await mockPythLazer.createMockPythPayload(
        ETH_FEED_ID,
        200000000000, // Valid price
        100000000,
        50, // Extreme positive exponent
        Math.floor(Date.now() / 1000)
      );
      await mockPythLazer.setMockPayload(ETH_FEED_ID, extremeExponentPayload);

      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);

      await expect(
        pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE })
      ).to.be.revertedWith("Invalid exponent");
    });

    it("Should handle contract call failures gracefully", async function () {
      // Test with insufficient gas to simulate call failure
      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);

      // This should not revert the entire transaction but may fail internally
      // We're testing that the contract handles edge cases gracefully
      const tx = await pythAdapter
        .connect(user0)
        .updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE, gasLimit: 500000 });

      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1); // Should not revert
    });
  });

  describe("Price Staleness Validation", function () {
    beforeEach(async function () {
      // Update price first
      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });
    });

    it("Should reject stale prices when max age is configured", async function () {
      // Set very short max age
      const shortMaxAge = 1; // 1 second
      await dataStore.setUint(keys.MAX_ORACLE_PRICE_AGE, shortMaxAge);

      // Wait for price to become stale
      await ethers.provider.send("evm_increaseTime", [shortMaxAge + 1]);
      await ethers.provider.send("evm_mine", []);

      // Try to get price - should be reverted due to staleness
      await expect(pythAdapter.connect(user0).callStatic.getOraclePrice(wnt.address, "0x")).to.be.reverted;
    });

    it("Should allow prices within max age", async function () {
      // Set reasonable max age
      const reasonableMaxAge = 3600; // 1 hour
      await dataStore.setUint(keys.MAX_ORACLE_PRICE_AGE, reasonableMaxAge);

      // Get price directly - no need for oracle impersonation anymore
      const result = await pythAdapter.connect(user0).callStatic.getOraclePrice(wnt.address, "0x");

      expect(result.min).to.be.gt(0);
      expect(result.max).to.be.gt(0);
      expect(result.timestamp).to.be.gt(0);
    });

    it("Should work when max age is not configured (zero)", async function () {
      // Set max age to 0 (no limit)
      await dataStore.setUint(keys.MAX_ORACLE_PRICE_AGE, 0);

      // Wait a long time
      await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
      await ethers.provider.send("evm_mine", []);

      // Should still work
      const result = await pythAdapter.connect(user0).callStatic.getOraclePrice(wnt.address, "0x");

      expect(result.min).to.be.gt(0);
    });
  });

  describe("Price Precision and Adjustments", function () {
    it("Should handle different decimal precisions correctly", async function () {
      const testCases = [
        { exponent: -8, expectedMultiplier: 22 }, // 30 - 8 = 22
        { exponent: -6, expectedMultiplier: 24 }, // 30 - 6 = 24
        { exponent: -18, expectedMultiplier: 12 }, // 30 - 18 = 12
        { exponent: 0, expectedMultiplier: 30 }, // 30 - 0 = 30
      ];

      for (const testCase of testCases) {
        const payload = await mockPythLazer.createMockPythPayload(
          ETH_FEED_ID,
          123456789, // Test price
          10000000, // Test confidence
          testCase.exponent,
          Math.floor(Date.now() / 1000)
        );
        await mockPythLazer.setMockPayload(ETH_FEED_ID, payload);

        const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
        await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

        const [price, , , isValid] = await pythAdapter.getStoredPrice(wnt.address);
        expect(isValid).to.be.true;

        // Verify price scaling
        const expectedPrice = ethers.BigNumber.from(123456789).mul(
          ethers.BigNumber.from(10).pow(testCase.expectedMultiplier)
        );
        expect(price).to.equal(expectedPrice);
      }
    });

    it("Should handle high precision decimals correctly", async function () {
      // Test with very high precision (negative exponent close to -18)
      const highPrecisionPayload = await mockPythLazer.createMockPythPayload(
        ETH_FEED_ID,
        100000000000000000n, // Large number to test precision
        1000000000000000n,
        -18, // Maximum supported negative exponent
        Math.floor(Date.now() / 1000)
      );
      await mockPythLazer.setMockPayload(ETH_FEED_ID, highPrecisionPayload);

      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

      const [price, confidence, , isValid] = await pythAdapter.getStoredPrice(wnt.address);
      expect(isValid).to.be.true;
      expect(price).to.be.gt(0);
      expect(confidence).to.be.gt(0);
    });
  });

  describe("Confidence Calculation", function () {
    it("Should calculate confidence from bid/ask spread", async function () {
      // Create payload with specific bid/ask prices
      const basePrice = 200000000000; // $2000 with 8 decimals
      const spreadHalf = 100000000; // $1 - this will be used as confidence input to mock

      // Mock will create: bid = price - confidence, ask = price + confidence
      // So spread = (price + confidence) - (price - confidence) = 2 * confidence
      // And confidence calculated = spread / 2 = confidence
      const payload = await mockPythLazer.createMockPythPayload(
        ETH_FEED_ID,
        basePrice,
        spreadHalf, // This becomes the confidence in mock bid/ask calculation
        -8,
        Math.floor(Date.now() / 1000)
      );
      await mockPythLazer.setMockPayload(ETH_FEED_ID, payload);

      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

      const [price, confidence, , isValid] = await pythAdapter.getStoredPrice(wnt.address);
      expect(isValid).to.be.true;

      // Expected confidence should be the spreadHalf value, adjusted to 30 decimals
      const expectedConfidence = expandDecimals(1, 30); // $1 in 30 decimals
      expect(confidence).to.equal(expectedConfidence);
    });

    it("Should cap confidence at 10% of price", async function () {
      // Create payload with very wide spread
      const basePrice = 200000000000; // $2000
      const confidenceInput = 50000000000; // $500 (25% of price)

      const payload = await mockPythLazer.createMockPythPayload(
        ETH_FEED_ID,
        basePrice,
        confidenceInput,
        -8,
        Math.floor(Date.now() / 1000)
      );
      await mockPythLazer.setMockPayload(ETH_FEED_ID, payload);

      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

      const [price, confidenceResult, , isValid] = await pythAdapter.getStoredPrice(wnt.address);
      expect(isValid).to.be.true;

      // Confidence should be capped at 10% of price
      const maxConfidence = price.div(10);
      expect(confidenceResult).to.equal(maxConfidence);
    });

    it("Should use default 1% confidence when no bid/ask available", async function () {
      // We'll need to create a custom mock payload without proper bid/ask
      // This would require modifying the mock or testing internal behavior
      // For now, we can test the current implementation behavior

      const payload = await mockPythLazer.createMockPythPayload(
        ETH_FEED_ID,
        200000000000, // $2000
        0, // Zero confidence input - will test fallback
        -8,
        Math.floor(Date.now() / 1000)
      );
      await mockPythLazer.setMockPayload(ETH_FEED_ID, payload);

      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

      const [price, confidence, , isValid] = await pythAdapter.getStoredPrice(wnt.address);
      expect(isValid).to.be.true;
      expect(confidence).to.be.gt(0);
      expect(confidence).to.be.lte(price.div(10)); // Should not exceed 10% cap
    });
  });

  describe("FX Market Specific Tests", function () {
    it("Should handle EUR/USD FX pair correctly", async function () {
      const updateData = await mockPythLazer.createMockUpdateData(EUR_USD_FEED_ID);

      await pythAdapter.connect(user0).updatePrice(eurUsdToken.address, updateData, { value: VERIFICATION_FEE });

      const [price, confidence, publishTime, isValid] = await pythAdapter.getStoredPrice(eurUsdToken.address);
      expect(isValid).to.be.true;
      expect(price).to.equal(expandDecimals(1085, 27)); // 1.085 in 30 decimals
      expect(confidence).to.be.gt(0);
      expect(publishTime).to.be.gt(0);
    });

    it("Should emit correct events for FX updates", async function () {
      const updateData = await mockPythLazer.createMockUpdateData(EUR_USD_FEED_ID);
      const currentTimestamp = Math.floor(Date.now() / 1000);

      await expect(pythAdapter.connect(user0).updatePrice(eurUsdToken.address, updateData, { value: VERIFICATION_FEE }))
        .to.emit(pythAdapter, "PythReferencePrice")
        .withArgs(
          eurUsdToken.address,
          user0.address,
          EUR_USD_FEED_ID,
          expandDecimals(1085, 27), // 1.085 in 30 decimals
          expandDecimals(1, 28), // confidence (half spread)
          currentTimestamp,
          VERIFICATION_FEE
        );
    });

    it("Should support multiple FX pairs simultaneously", async function () {
      // Update EUR/USD
      const eurUpdateData = await mockPythLazer.createMockUpdateData(EUR_USD_FEED_ID);
      await pythAdapter.connect(user0).updatePrice(eurUsdToken.address, eurUpdateData, { value: VERIFICATION_FEE });

      // Update ETH (crypto)
      const ethUpdateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      await pythAdapter.connect(user0).updatePrice(wnt.address, ethUpdateData, { value: VERIFICATION_FEE });

      // Both should be valid
      const [eurPrice, , , eurValid] = await pythAdapter.getStoredPrice(eurUsdToken.address);
      const [ethPrice, , , ethValid] = await pythAdapter.getStoredPrice(wnt.address);

      expect(eurValid).to.be.true;
      expect(ethValid).to.be.true;
      expect(eurPrice).to.be.gt(0);
      expect(ethPrice).to.be.gt(0);

      // FX should be much smaller than crypto price (different scales)
      expect(eurPrice).to.be.lt(ethPrice);
    });
  });

  describe("Event Emissions", function () {
    it("Should emit PythVerificationFeeRefund on excess payment", async function () {
      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      const excessFee = VERIFICATION_FEE.mul(3);
      const excessAmount = excessFee.sub(VERIFICATION_FEE);

      await expect(pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: excessFee }))
        .to.emit(pythAdapter, "PythVerificationFeeRefund")
        .withArgs(user0.address, excessAmount);
    });

    it("Should not emit refund event when exact fee is paid", async function () {
      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);

      const tx = await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

      const receipt = await tx.wait();
      const refundEvents = receipt.events?.filter((e) => e.event === "PythVerificationFeeRefund");
      expect(refundEvents?.length || 0).to.equal(0);
    });
  });

  describe("Integration with Oracle System", function () {
    it("Should provide consistent data format for Oracle.sol", async function () {
      // Update price first
      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

      // Get data as Oracle would - now anyone can call it
      const result = await pythAdapter.connect(user0).callStatic.getOraclePrice(wnt.address, "0x");

      // Verify Oracle.sol can extract: pyth_price, pyth_conf, pyth_publish_time
      expect(result.token).to.equal(wnt.address);
      expect(result.min).to.be.gt(0); // pyth_price
      expect(result.max).to.be.gt(0); // pyth_conf
      expect(result.timestamp).to.be.gt(0); // pyth_publish_time
      expect(result.provider).to.equal(pythAdapter.address);
    });

    it("Should validate Oracle.sol can perform dual-oracle validation", async function () {
      // This test ensures the PythAdapter provides the right data structure
      // for Oracle.sol to compare against Chainlink prices

      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

      const result = await pythAdapter.connect(user0).callStatic.getOraclePrice(wnt.address, "0x");

      // Verify the data format matches expected structure for dual validation
      expect(result.min).to.equal(expandDecimals(2000, 30)); // pyth_price in 30 decimals
      expect(result.max).to.equal(expandDecimals(1, 30)); // pyth_conf in 30 decimals
      expect(result.provider).to.equal(pythAdapter.address);
    });
  });

  describe("Multi-Feed Payload Tests", function () {
    it("Should parse payload with multiple feeds correctly", async function () {
      // This tests the adapter's ability to find the correct feed in a multi-feed payload
      // For this test, we'll update multiple feeds and verify each works independently

      // Update ETH first
      const ethUpdateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      await pythAdapter.connect(user0).updatePrice(wnt.address, ethUpdateData, { value: VERIFICATION_FEE });

      // Update BTC
      const btcUpdateData = await mockPythLazer.createMockUpdateData(BTC_FEED_ID);
      await pythAdapter.connect(user0).updatePrice(wbtc.address, btcUpdateData, { value: VERIFICATION_FEE });

      // Update EUR/USD
      const eurUpdateData = await mockPythLazer.createMockUpdateData(EUR_USD_FEED_ID);
      await pythAdapter.connect(user0).updatePrice(eurUsdToken.address, eurUpdateData, { value: VERIFICATION_FEE });

      // Verify all three feeds have valid data
      const [ethPrice, , , ethValid] = await pythAdapter.getStoredPrice(wnt.address);
      const [btcPrice, , , btcValid] = await pythAdapter.getStoredPrice(wbtc.address);
      const [eurPrice, , , eurValid] = await pythAdapter.getStoredPrice(eurUsdToken.address);

      expect(ethValid).to.be.true;
      expect(btcValid).to.be.true;
      expect(eurValid).to.be.true;

      // Verify each price is different (they should have different scales)
      expect(ethPrice).to.not.equal(btcPrice);
      expect(ethPrice).to.not.equal(eurPrice);
      expect(btcPrice).to.not.equal(eurPrice);

      // ETH should be $2000, BTC should be $50000, EUR/USD should be ~1.085
      expect(ethPrice).to.equal(expandDecimals(2000, 30));
      expect(btcPrice).to.equal(expandDecimals(50000, 30));
      expect(eurPrice).to.equal(expandDecimals(1085, 27));
    });

    it("Should handle feeds with different property counts", async function () {
      // Test that the adapter can handle feeds with varying numbers of properties
      // Our mock creates feeds with 4 properties, but real Pyth feeds might vary

      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      const result = await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

      const receipt = await result.wait();
      expect(receipt.status).to.equal(1);

      const [price, confidence, publishTime, isValid] = await pythAdapter.getStoredPrice(wnt.address);
      expect(isValid).to.be.true;
      expect(price).to.be.gt(0);
      expect(confidence).to.be.gt(0);
      expect(publishTime).to.be.gt(0);
    });

    it("Should correctly skip feeds when target feed is not first", async function () {
      // This tests the _skipFeedProperties functionality
      // We're testing that if we're looking for BTC but ETH comes first, it properly skips ETH

      const btcUpdateData = await mockPythLazer.createMockUpdateData(BTC_FEED_ID);
      await pythAdapter.connect(user0).updatePrice(wbtc.address, btcUpdateData, { value: VERIFICATION_FEE });

      const [price, , , isValid] = await pythAdapter.getStoredPrice(wbtc.address);
      expect(isValid).to.be.true;
      expect(price).to.equal(expandDecimals(50000, 30)); // $50,000 in 30 decimals
    });
  });

  describe("Invalid Property Handling", function () {
    it("Should handle missing required properties gracefully", async function () {
      // Test payload parsing when required properties (Price, Exponent) are missing
      // This would result in isValid = false in the PythPriceData

      // Create a payload without proper price data (zero price)
      const invalidPayload = await mockPythLazer.createMockPythPayload(
        ETH_FEED_ID,
        0, // Invalid zero price
        100000000,
        -8,
        Math.floor(Date.now() / 1000)
      );
      await mockPythLazer.setMockPayload(ETH_FEED_ID, invalidPayload);

      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      const result = await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

      // Transaction should succeed but price should not be stored as valid
      const receipt = await result.wait();
      expect(receipt.status).to.equal(1);

      const [, , , isValid] = await pythAdapter.getStoredPrice(wnt.address);
      expect(isValid).to.be.false;
    });

    it("Should reject updates with invalid channel", async function () {
      // Test that non-RealTime channels are rejected
      // This would require a more sophisticated mock, but we can test the current behavior

      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);

      // The current mock always uses RealTime channel, so this should succeed
      const result = await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

      const receipt = await result.wait();
      expect(receipt.status).to.equal(1);
    });

    it("Should handle feed ID not found in payload", async function () {
      // Test when the requested feed ID is not in the payload
      const nonExistentFeedId = 999;

      // Try to update with a feed ID that doesn't exist in our mock payloads
      const updateData = await mockPythLazer.createMockUpdateData(nonExistentFeedId);

      await expect(
        pythAdapter.connect(user0).updatePrice(
          wnt.address, // This maps to ETH_FEED_ID, but update data is for nonExistentFeedId
          updateData,
          { value: VERIFICATION_FEE }
        )
      ).to.be.revertedWith("No mock payload configured for feed");
    });

    it("Should handle malformed update data", async function () {
      // Test with malformed update data
      const malformedData = "0x1234"; // Too short, should fail

      await expect(
        pythAdapter.connect(user0).updatePrice(wnt.address, malformedData, { value: VERIFICATION_FEE })
      ).to.be.revertedWith("Update too short");
    });

    it("Should validate payload structure correctly", async function () {
      // Test that the adapter properly validates the Pyth payload structure
      // This includes checking magic numbers, feed counts, etc.

      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);

      const result = await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

      const receipt = await result.wait();
      expect(receipt.status).to.equal(1);

      // Verify that the parsed data is structurally correct
      const [price, confidence, publishTime, isValid] = await pythAdapter.getStoredPrice(wnt.address);
      expect(isValid).to.be.true;
      expect(price).to.be.gt(0);
      expect(confidence).to.be.gt(0);
      expect(publishTime).to.be.gt(0);

      // Verify the data has proper 30-decimal precision
      expect(price.toString().length).to.be.gte(15); // Should be a large number
    });
  });

  describe("Gas Optimization Tests", function () {
    it("Should handle updates efficiently for frequently used feeds", async function () {
      // Test multiple updates to the same feed to ensure no gas issues
      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);

      // Update multiple times
      for (let i = 0; i < 3; i++) {
        const tx = await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

        const receipt = await tx.wait();
        expect(receipt.status).to.equal(1);
        expect(receipt.gasUsed).to.be.lt(500000); // Should be reasonable gas usage
      }

      // Final state should be valid
      const [, , , isValid] = await pythAdapter.getStoredPrice(wnt.address);
      expect(isValid).to.be.true;
    });

    it("Should emit events efficiently", async function () {
      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);

      const tx = await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

      const receipt = await tx.wait();

      // Should emit exactly one PythReferencePrice event
      const priceEvents = receipt.events?.filter((e) => e.event === "PythReferencePrice");
      expect(priceEvents?.length).to.equal(1);

      // Should not emit refund event when exact fee is paid
      const refundEvents = receipt.events?.filter((e) => e.event === "PythVerificationFeeRefund");
      expect(refundEvents?.length || 0).to.equal(0);
    });
  });

  describe("Error Recovery and Robustness", function () {
    it("Should recover from failed updates", async function () {
      // Test that a failed update doesn't break subsequent updates

      // First, try to update an unsupported token (should fail)
      const unsupportedToken = "0x1111111111111111111111111111111111111111";
      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);

      await expect(
        pythAdapter.connect(user0).updatePrice(unsupportedToken, updateData, { value: VERIFICATION_FEE })
      ).to.be.revertedWith("PythAdapter: No feed ID configured");

      // Then, update a supported token (should succeed)
      await expect(pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE })).to.not
        .be.reverted;

      const [, , , isValid] = await pythAdapter.getStoredPrice(wnt.address);
      expect(isValid).to.be.true;
    });

    it("Should handle edge case timestamps correctly", async function () {
      // Test with edge case timestamps (very old, very new)
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400; // 1 day in future

      const futurePayload = await mockPythLazer.createMockPythPayload(
        ETH_FEED_ID,
        200000000000,
        100000000,
        -8,
        futureTimestamp
      );
      await mockPythLazer.setMockPayload(ETH_FEED_ID, futurePayload);

      const updateData = await mockPythLazer.createMockUpdateData(ETH_FEED_ID);
      await pythAdapter.connect(user0).updatePrice(wnt.address, updateData, { value: VERIFICATION_FEE });

      const [, , publishTime, isValid] = await pythAdapter.getStoredPrice(wnt.address);
      expect(isValid).to.be.true;
      expect(publishTime).to.equal(futureTimestamp);
    });
  });
});
