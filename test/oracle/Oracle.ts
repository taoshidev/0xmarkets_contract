import { expect } from "chai";

import { expandDecimals } from "../../utils/math";
import { hashString } from "../../utils/hash";
import { deployFixture } from "../../utils/fixture";
import { TOKEN_ORACLE_TYPES, getOracleParams, encodeDataStreamData } from "../../utils/oracle";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

describe("0xMarket Oracle - Dual Oracle System", () => {
  let signers;
  let dataStore, oracle, wnt, wbtc, usdc, eurUsd;
  let chainlinkAdapter, pythAdapter;
  let oracleSalt, signerIndexes;

  beforeEach(async () => {
    const fixture = await deployFixture();
    ({ signers } = fixture.accounts);

    ({ dataStore, oracle, wnt, wbtc, usdc } = fixture.contracts);
    ({ oracleSalt, signerIndexes } = fixture.props);

    // Create mock oracle adapters for 0xMarket testing
    // For testing purposes, we'll use mock addresses since the actual adapters
    // would be deployed separately in a real environment
    chainlinkAdapter = { address: "0x1000000000000000000000000000000000000001" };
    pythAdapter = { address: "0x2000000000000000000000000000000000000002" };

    // Create EUR/USD asset token for FX testing
    const AssetTokenFactory = await ethers.getContractFactory("AssetToken");
    eurUsd = await AssetTokenFactory.deploy("EUR/USD", "EURUSD");

    // Enable oracle providers
    await dataStore.setBool(keys.isOracleProviderEnabledKey(chainlinkAdapter.address), true);
    await dataStore.setBool(keys.isOracleProviderEnabledKey(pythAdapter.address), true);

    // Set global Pyth oracle provider
    await dataStore.setAddress(keys.PYTH_ORACLE_PROVIDER, pythAdapter.address);
  });

  describe("Dual Oracle Configuration", () => {
    it("should configure dual oracle parameters", async () => {
      // Test that dual oracle configuration can be set
      await dataStore.setBytes32(keys.pythFeedIdKey(eurUsd.address), hashString("EUR/USD"));
      await dataStore.setUint(keys.chainlinkOracleTTLKey(eurUsd.address), 2); // 2 seconds TTL
      await dataStore.setUint(keys.pythOracleTTLKey(eurUsd.address), 2); // 2 seconds TTL
      await dataStore.setUint(keys.maxOracleTimeSkewKey(eurUsd.address), 600); // 600ms max skew
      await dataStore.setUint(keys.pythConfidenceMultiplierKey(eurUsd.address), expandDecimals(3, 18)); // K=3

      // Verify configuration was set correctly
      expect(await dataStore.getBytes32(keys.pythFeedIdKey(eurUsd.address))).to.equal(hashString("EUR/USD"));
      expect(await dataStore.getUint(keys.chainlinkOracleTTLKey(eurUsd.address))).to.equal(2);
      expect(await dataStore.getUint(keys.pythOracleTTLKey(eurUsd.address))).to.equal(2);
      expect(await dataStore.getUint(keys.maxOracleTimeSkewKey(eurUsd.address))).to.equal(600);
      expect(await dataStore.getUint(keys.pythConfidenceMultiplierKey(eurUsd.address))).to.equal(expandDecimals(3, 18));
    });

    it("should set oracle providers correctly", async () => {
      // Enable oracle providers
      await dataStore.setBool(keys.isOracleProviderEnabledKey(chainlinkAdapter.address), true);
      await dataStore.setBool(keys.isOracleProviderEnabledKey(pythAdapter.address), true);

      // Set oracle provider for token
      await dataStore.setAddress(keys.oracleProviderForTokenKey(eurUsd.address), chainlinkAdapter.address);

      // Set global Pyth oracle provider
      await dataStore.setAddress(keys.PYTH_ORACLE_PROVIDER, pythAdapter.address);

      // Verify providers are set correctly
      expect(await dataStore.getBool(keys.isOracleProviderEnabledKey(chainlinkAdapter.address))).to.be.true;
      expect(await dataStore.getBool(keys.isOracleProviderEnabledKey(pythAdapter.address))).to.be.true;
      expect(await dataStore.getAddress(keys.oracleProviderForTokenKey(eurUsd.address))).to.equal(
        chainlinkAdapter.address
      );
      expect(await dataStore.getAddress(keys.PYTH_ORACLE_PROVIDER)).to.equal(pythAdapter.address);
    });
  });

  describe("Legacy GMX Compatibility", () => {
    it.skip("should work with traditional signed oracle prices", async () => {
      // 0xMarket: Skip this test as 0xMarket doesn't use GMX's signed oracle system
      // 0xMarket uses Chainlink and Pyth oracles instead
      console.log("Skipping GMX signed oracle test - 0xMarket uses Chainlink/Pyth oracles");
    });

    it("should reject invalid oracle providers", async () => {
      await expect(
        oracle.setPrices({
          tokens: [wnt.address],
          providers: [wbtc.address], // Invalid provider
          data: ["0x"],
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidOracleProvider");
    });
  });
});
