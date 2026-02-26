/**
 * auditAddresses.ts — Automated contract address audit script
 *
 * Reads on-chain DataStore state for all markets, tokens, and oracle config,
 * then compares against every config file across all 0xMarkets services.
 *
 * Usage:
 *   npx hardhat run scripts/auditAddresses.ts --network baseSepolia
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { hashData, hashString } from "../utils/hash";

// ─── Key constants (replicated from utils/keys.ts for inline use) ───
const RESERVE_FACTOR = hashString("RESERVE_FACTOR");
const OPEN_INTEREST_RESERVE_FACTOR = hashString("OPEN_INTEREST_RESERVE_FACTOR");
const MAX_POOL_AMOUNT = hashString("MAX_POOL_AMOUNT");
const IS_MARKET_DISABLED = hashString("IS_MARKET_DISABLED");
const ORACLE_PROVIDER_FOR_TOKEN = hashString("ORACLE_PROVIDER_FOR_TOKEN");
const ASSET_TOKEN = hashString("ASSET_TOKEN");
const MAX_OPEN_INTEREST = hashString("MAX_OPEN_INTEREST");

function reserveFactorKey(market: string, isLong: boolean): string {
  return hashData(["bytes32", "address", "bool"], [RESERVE_FACTOR, market, isLong]);
}

function openInterestReserveFactorKey(market: string, isLong: boolean): string {
  return hashData(["bytes32", "address", "bool"], [OPEN_INTEREST_RESERVE_FACTOR, market, isLong]);
}

function maxPoolAmountKey(market: string, token: string): string {
  return hashData(["bytes32", "address", "address"], [MAX_POOL_AMOUNT, market, token]);
}

function isMarketDisabledKey(market: string): string {
  return hashData(["bytes32", "address"], [IS_MARKET_DISABLED, market]);
}

function oracleProviderForTokenKey(token: string): string {
  return hashData(["bytes32", "address"], [ORACLE_PROVIDER_FOR_TOKEN, token]);
}

function assetTokenKey(asset: string): string {
  return hashData(["bytes32", "string"], [ASSET_TOKEN, asset]);
}

function maxOpenInterestKey(market: string, isLong: boolean): string {
  return hashData(["bytes32", "address", "bool"], [MAX_OPEN_INTEREST, market, isLong]);
}

// ─── Types ───
interface OnChainMarket {
  marketToken: string;
  indexToken: string;
  longToken: string;
  shortToken: string;
}

interface ComparisonResult {
  service: string;
  file: string;
  field: string;
  configValue: string;
  onChainValue: string;
  status: "MATCH" | "MISMATCH";
}

interface MarketHealthResult {
  market: string;
  label: string;
  reserveFactorLong: string;
  reserveFactorShort: string;
  oiReserveFactorLong: string;
  oiReserveFactorShort: string;
  maxPoolAmountLong: string;
  maxPoolAmountShort: string;
  maxOILong: string;
  maxOIShort: string;
  disabled: boolean;
  healthy: boolean;
}

// ─── Helpers ───
function addr(a: string): string {
  try {
    return ethers.utils.getAddress(a);
  } catch {
    return a;
  }
}

function compareAddresses(a: string, b: string): boolean {
  try {
    return ethers.utils.getAddress(a) === ethers.utils.getAddress(b);
  } catch {
    return a.toLowerCase() === b.toLowerCase();
  }
}

function readFileIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

// Market labels based on index token
const MARKET_LABELS: Record<string, string> = {};

async function main() {
  const results: ComparisonResult[] = [];
  const blockNumber = await ethers.provider.getBlockNumber();
  console.log(`\n${"=".repeat(80)}`);
  console.log("  0xMarkets Contract Address Audit");
  console.log(`  Chain: Base Sepolia (84532)`);
  console.log(`  Block: ${blockNumber}`);
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log(`${"=".repeat(80)}\n`);

  // ─── 1. Read on-chain market data ───
  const reader = await ethers.getContract("Reader");
  const dataStore = await ethers.getContract("DataStore");

  console.log(`DataStore: ${dataStore.address}`);
  console.log(`Reader: ${reader.address}\n`);

  console.log("─── SECTION 1: On-Chain Markets ───\n");

  const marketsRaw = await reader.getMarkets(dataStore.address, 0, 100);
  const markets: OnChainMarket[] = marketsRaw.map((m: any) => ({
    marketToken: addr(m.marketToken),
    indexToken: addr(m.indexToken),
    longToken: addr(m.longToken),
    shortToken: addr(m.shortToken),
  }));

  console.log(`Total markets on-chain: ${markets.length}\n`);
  for (const m of markets) {
    console.log(`  Market: ${m.marketToken}`);
    console.log(`    Index: ${m.indexToken}`);
    console.log(`    Long:  ${m.longToken}`);
    console.log(`    Short: ${m.shortToken}`);
    console.log();
  }

  // ─── 2. Read on-chain asset token addresses ───
  console.log("─── SECTION 2: On-Chain Asset Token Addresses ───\n");

  const syntheticAssets = ["EUR", "GBP", "GOLD", "JPY"];
  const onChainAssetTokens: Record<string, string> = {};

  for (const symbol of syntheticAssets) {
    const key = assetTokenKey(symbol);
    const address = await dataStore.getAddress(key);
    onChainAssetTokens[symbol] = addr(address);
    console.log(`  ${symbol}: ${addr(address)}`);
  }
  console.log();

  // Known real token addresses (not stored as assets in DataStore)
  const knownRealTokens: Record<string, string> = {
    USDC: "", // Will be determined from market longToken/shortToken
    WBTC: "", // Will be determined from market indexToken
    WETH: "", // Will be determined from market indexToken
  };

  // Determine real token addresses from on-chain markets
  for (const m of markets) {
    // USDC is always the long/short token
    if (knownRealTokens.USDC === "") {
      knownRealTokens.USDC = m.longToken;
    }
    // Check index tokens for WBTC and WETH - we'll label them post-facto
  }

  // Build a comprehensive on-chain token map
  const onChainTokens: Record<string, string> = {
    ...onChainAssetTokens,
    ...knownRealTokens,
  };

  // Build market labels
  // We need to match index tokens to symbols
  const allTokenAddresses: Record<string, string> = {};
  for (const [sym, addr_] of Object.entries(onChainAssetTokens)) {
    allTokenAddresses[addr_] = sym;
  }
  // WETH is canonical
  allTokenAddresses["0x4200000000000000000000000000000000000006"] = "WETH";

  for (const m of markets) {
    const indexLabel = allTokenAddresses[m.indexToken] || "UNKNOWN";
    if (indexLabel === "WETH") {
      MARKET_LABELS[m.marketToken] = "WETH/USD";
      knownRealTokens.WETH = m.indexToken;
    } else if (indexLabel === "UNKNOWN") {
      // Might be WBTC — check against known WBTC addresses
      MARKET_LABELS[m.marketToken] = `${m.indexToken.slice(0, 10)}/USD`;
    } else {
      MARKET_LABELS[m.marketToken] = `${indexLabel}/USD`;
    }
  }

  // For WBTC — it's a real token, find the market whose indexToken is NOT a synthetic and NOT WETH
  for (const m of markets) {
    const indexAddr = m.indexToken;
    if (
      !Object.values(onChainAssetTokens).includes(indexAddr) &&
      indexAddr !== "0x4200000000000000000000000000000000000006"
    ) {
      knownRealTokens.WBTC = indexAddr;
      allTokenAddresses[indexAddr] = "WBTC";
      MARKET_LABELS[m.marketToken] = "WBTC/USD";
    }
  }

  onChainTokens.USDC = knownRealTokens.USDC;
  onChainTokens.WBTC = knownRealTokens.WBTC;
  onChainTokens.WETH = knownRealTokens.WETH;

  console.log("  Determined real token addresses from on-chain data:");
  console.log(`  USDC: ${onChainTokens.USDC}`);
  console.log(`  WBTC: ${onChainTokens.WBTC}`);
  console.log(`  WETH: ${onChainTokens.WETH}`);
  console.log();

  // ─── 3. Read on-chain market parameters ───
  console.log("─── SECTION 3: Market Parameters ───\n");

  const marketHealth: MarketHealthResult[] = [];

  for (const m of markets) {
    const label = MARKET_LABELS[m.marketToken] || m.marketToken;
    const longToken = m.longToken;
    const shortToken = m.shortToken;

    const rfLong = await dataStore.getUint(reserveFactorKey(m.marketToken, true));
    const rfShort = await dataStore.getUint(reserveFactorKey(m.marketToken, false));
    const oiRfLong = await dataStore.getUint(openInterestReserveFactorKey(m.marketToken, true));
    const oiRfShort = await dataStore.getUint(openInterestReserveFactorKey(m.marketToken, false));
    const maxPoolLong = await dataStore.getUint(maxPoolAmountKey(m.marketToken, longToken));
    const maxPoolShort = await dataStore.getUint(maxPoolAmountKey(m.marketToken, shortToken));
    const maxOILong = await dataStore.getUint(maxOpenInterestKey(m.marketToken, true));
    const maxOIShort = await dataStore.getUint(maxOpenInterestKey(m.marketToken, false));
    const disabled = await dataStore.getBool(isMarketDisabledKey(m.marketToken));

    const healthy =
      !disabled &&
      !rfLong.isZero() &&
      !rfShort.isZero() &&
      !oiRfLong.isZero() &&
      !oiRfShort.isZero() &&
      !maxPoolLong.isZero() &&
      !maxPoolShort.isZero();

    const entry: MarketHealthResult = {
      market: m.marketToken,
      label,
      reserveFactorLong: rfLong.toString(),
      reserveFactorShort: rfShort.toString(),
      oiReserveFactorLong: oiRfLong.toString(),
      oiReserveFactorShort: oiRfShort.toString(),
      maxPoolAmountLong: maxPoolLong.toString(),
      maxPoolAmountShort: maxPoolShort.toString(),
      maxOILong: maxOILong.toString(),
      maxOIShort: maxOIShort.toString(),
      disabled,
      healthy,
    };

    marketHealth.push(entry);

    console.log(`  ${label} (${m.marketToken}):`);
    console.log(`    Reserve Factor (Long):  ${rfLong.isZero() ? "ZERO!" : rfLong.toString()}`);
    console.log(`    Reserve Factor (Short): ${rfShort.isZero() ? "ZERO!" : rfShort.toString()}`);
    console.log(`    OI Reserve Factor (Long):  ${oiRfLong.isZero() ? "ZERO!" : oiRfLong.toString()}`);
    console.log(`    OI Reserve Factor (Short): ${oiRfShort.isZero() ? "ZERO!" : oiRfShort.toString()}`);
    console.log(`    Max Pool (Long):  ${maxPoolLong.isZero() ? "ZERO!" : maxPoolLong.toString()}`);
    console.log(`    Max Pool (Short): ${maxPoolShort.isZero() ? "ZERO!" : maxPoolShort.toString()}`);
    console.log(`    Max OI (Long):  ${maxOILong.isZero() ? "ZERO!" : maxOILong.toString()}`);
    console.log(`    Max OI (Short): ${maxOIShort.isZero() ? "ZERO!" : maxOIShort.toString()}`);
    console.log(`    Disabled: ${disabled}`);
    console.log(`    Status: ${healthy ? "OK" : "UNHEALTHY"}`);
    console.log();
  }

  // ─── 4. Read on-chain oracle config ───
  console.log("─── SECTION 4: Oracle Configuration ───\n");

  const oracleConfig: Record<string, string> = {};
  const allTokenSymbols = [...syntheticAssets, "USDC", "WBTC", "WETH"];

  for (const symbol of allTokenSymbols) {
    const tokenAddr = onChainTokens[symbol];
    if (!tokenAddr || tokenAddr === ethers.constants.AddressZero) {
      console.log(`  ${symbol}: No address available, skipping oracle lookup`);
      continue;
    }
    const key = oracleProviderForTokenKey(tokenAddr);
    const provider = await dataStore.getAddress(key);
    oracleConfig[symbol] = addr(provider);
    const isZero = provider === ethers.constants.AddressZero;
    console.log(`  ${symbol} (${tokenAddr}): ${isZero ? "NOT SET" : addr(provider)}`);
  }
  console.log();

  // ─── 5. Compare against config files ───
  console.log("─── SECTION 5: Service-by-Service Comparison ───\n");

  const contractsRepoRoot = path.resolve(__dirname, "..");
  const monorepoRoot = path.resolve(contractsRepoRoot, "..");

  // Pre-fetch contract addresses needed for comparisons
  const onChainEventEmitter = (await ethers.getContract("EventEmitter")).address;
  const onChainRef = (await ethers.getContract("ReferralStorage")).address;

  // Helper to add comparison result
  function compare(service: string, file: string, field: string, configValue: string, onChainValue: string) {
    const match = compareAddresses(configValue, onChainValue);
    const result: ComparisonResult = {
      service,
      file: file.replace(monorepoRoot + "/", ""),
      field,
      configValue: addr(configValue),
      onChainValue: addr(onChainValue),
      status: match ? "MATCH" : "MISMATCH",
    };
    results.push(result);
    const icon = match ? "MATCH" : "MISMATCH";
    if (!match) {
      console.log(`  [${icon}] ${field}: config=${addr(configValue)} on-chain=${addr(onChainValue)}`);
    } else {
      console.log(`  [${icon}] ${field}`);
    }
  }

  // ─── 5a. Interface SDK — markets.ts ───
  console.log("  --- Interface SDK: markets.ts ---");
  const sdkMarketsPath = path.join(monorepoRoot, "0xMarkets-Interface/sdk/src/configs/markets.ts");
  const sdkMarketsContent = readFileIfExists(sdkMarketsPath);
  if (sdkMarketsContent) {
    // Extract all market entries with their fields
    const fullMarketRegex =
      /["'](0x[0-9a-fA-F]{40})["']\s*:\s*\{[^}]*marketTokenAddress:\s*["'](0x[0-9a-fA-F]{40})["'][^}]*indexTokenAddress:\s*["'](0x[0-9a-fA-F]{40})["'][^}]*longTokenAddress:\s*["'](0x[0-9a-fA-F]{40})["'][^}]*shortTokenAddress:\s*["'](0x[0-9a-fA-F]{40})["']/g;
    let mMatch: RegExpExecArray | null;
    const sdkMarkets: Array<{
      key: string;
      marketToken: string;
      indexToken: string;
      longToken: string;
      shortToken: string;
    }> = [];

    while ((mMatch = fullMarketRegex.exec(sdkMarketsContent)) !== null) {
      sdkMarkets.push({
        key: mMatch[1],
        marketToken: mMatch[2],
        indexToken: mMatch[3],
        longToken: mMatch[4],
        shortToken: mMatch[5],
      });
    }

    // Check each on-chain market exists in SDK
    for (const onChainMkt of markets) {
      const label = MARKET_LABELS[onChainMkt.marketToken] || onChainMkt.marketToken;
      const sdkMatch = sdkMarkets.find((s) => compareAddresses(s.marketToken, onChainMkt.marketToken));
      if (sdkMatch) {
        compare("Interface SDK", sdkMarketsPath, `${label} marketToken`, sdkMatch.marketToken, onChainMkt.marketToken);
        compare("Interface SDK", sdkMarketsPath, `${label} indexToken`, sdkMatch.indexToken, onChainMkt.indexToken);
        compare("Interface SDK", sdkMarketsPath, `${label} longToken`, sdkMatch.longToken, onChainMkt.longToken);
        compare("Interface SDK", sdkMarketsPath, `${label} shortToken`, sdkMatch.shortToken, onChainMkt.shortToken);
      } else {
        results.push({
          service: "Interface SDK",
          file: sdkMarketsPath.replace(monorepoRoot + "/", ""),
          field: `${label} market MISSING from SDK`,
          configValue: "NOT FOUND",
          onChainValue: onChainMkt.marketToken,
          status: "MISMATCH",
        });
        console.log(`  [MISMATCH] ${label} market NOT FOUND in SDK (on-chain: ${onChainMkt.marketToken})`);
      }
    }

    // Check for SDK markets that don't exist on-chain
    for (const sdkMkt of sdkMarkets) {
      const exists = markets.find((m) => compareAddresses(m.marketToken, sdkMkt.marketToken));
      if (!exists) {
        results.push({
          service: "Interface SDK",
          file: sdkMarketsPath.replace(monorepoRoot + "/", ""),
          field: `SDK market ${sdkMkt.key} NOT on-chain`,
          configValue: sdkMkt.marketToken,
          onChainValue: "NOT ON CHAIN",
          status: "MISMATCH",
        });
        console.log(`  [MISMATCH] SDK market ${sdkMkt.key} does NOT exist on-chain`);
      }
    }
  } else {
    console.log(`  WARNING: Could not read ${sdkMarketsPath}`);
  }
  console.log();

  // ─── 5b. Interface SDK — tokens.ts ───
  console.log("  --- Interface SDK: tokens.ts ---");
  const sdkTokensPath = path.join(monorepoRoot, "0xMarkets-Interface/sdk/src/configs/tokens.ts");
  const sdkTokensContent = readFileIfExists(sdkTokensPath);
  if (sdkTokensContent) {
    // Extract token symbol + address pairs from the BASE_SEPOLIA section
    // Look for patterns like: symbol: "EUR", ... address: "0x..."
    const tokenBlockRegex = /symbol:\s*["'](\w+)["'][^}]*?address:\s*["'](0x[0-9a-fA-F]{40})["']/gs;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tokenBlockRegex.exec(sdkTokensContent)) !== null) {
      const symbol = tMatch[1];
      const configAddr = tMatch[2];
      if (onChainTokens[symbol] && onChainTokens[symbol] !== "") {
        compare("Interface SDK", sdkTokensPath, `Token ${symbol}`, configAddr, onChainTokens[symbol]);
      }
    }
  }
  console.log();

  // ─── 5c. Interface SDK — contracts.ts ───
  console.log("  --- Interface SDK: contracts.ts ---");
  const sdkContractsPath = path.join(monorepoRoot, "0xMarkets-Interface/sdk/src/configs/contracts.ts");
  const sdkContractsContent = readFileIfExists(sdkContractsPath);
  if (sdkContractsContent) {
    // Compare infrastructure contract addresses
    // DataStore address
    const dsMatch = sdkContractsContent.match(/DataStore:\s*["'](0x[0-9a-fA-F]{40})["']/);
    if (dsMatch) {
      compare("Interface SDK", sdkContractsPath, "DataStore", dsMatch[1], dataStore.address);
    }
    // EventEmitter
    const eeMatch = sdkContractsContent.match(/EventEmitter:\s*["'](0x[0-9a-fA-F]{40})["']/);
    if (eeMatch) {
      compare("Interface SDK", sdkContractsPath, "EventEmitter", eeMatch[1], onChainEventEmitter);
    }
    // SyntheticsReader / Reader
    const readerMatch = sdkContractsContent.match(/SyntheticsReader:\s*["'](0x[0-9a-fA-F]{40})["']/);
    if (readerMatch) {
      compare("Interface SDK", sdkContractsPath, "SyntheticsReader", readerMatch[1], reader.address);
    }
    // ExchangeRouter
    const erMatch = sdkContractsContent.match(/ExchangeRouter:\s*["'](0x[0-9a-fA-F]{40})["']/);
    const onChainER = (await ethers.getContract("ExchangeRouter")).address;
    if (erMatch) {
      compare("Interface SDK", sdkContractsPath, "ExchangeRouter", erMatch[1], onChainER);
    }
    // DepositVault
    const dvMatch = sdkContractsContent.match(/DepositVault:\s*["'](0x[0-9a-fA-F]{40})["']/);
    const onChainDV = (await ethers.getContract("DepositVault")).address;
    if (dvMatch) {
      compare("Interface SDK", sdkContractsPath, "DepositVault", dvMatch[1], onChainDV);
    }
    // WithdrawalVault
    const wvMatch = sdkContractsContent.match(/WithdrawalVault:\s*["'](0x[0-9a-fA-F]{40})["']/);
    const onChainWV = (await ethers.getContract("WithdrawalVault")).address;
    if (wvMatch) {
      compare("Interface SDK", sdkContractsPath, "WithdrawalVault", wvMatch[1], onChainWV);
    }
    // OrderVault
    const ovMatch = sdkContractsContent.match(/OrderVault:\s*["'](0x[0-9a-fA-F]{40})["']/);
    const onChainOV = (await ethers.getContract("OrderVault")).address;
    if (ovMatch) {
      compare("Interface SDK", sdkContractsPath, "OrderVault", ovMatch[1], onChainOV);
    }
    // ShiftVault
    const svMatch = sdkContractsContent.match(/ShiftVault:\s*["'](0x[0-9a-fA-F]{40})["']/);
    const onChainSV = (await ethers.getContract("ShiftVault")).address;
    if (svMatch) {
      compare("Interface SDK", sdkContractsPath, "ShiftVault", svMatch[1], onChainSV);
    }
    // SyntheticsRouter
    const srMatch = sdkContractsContent.match(/SyntheticsRouter:\s*["'](0x[0-9a-fA-F]{40})["']/);
    const onChainSR = (await ethers.getContract("Router")).address;
    if (srMatch) {
      compare("Interface SDK", sdkContractsPath, "SyntheticsRouter", srMatch[1], onChainSR);
    }
    // ReferralStorage
    const refMatch = sdkContractsContent.match(/ReferralStorage:\s*["'](0x[0-9a-fA-F]{40})["']/);
    if (refMatch) {
      compare("Interface SDK", sdkContractsPath, "ReferralStorage", refMatch[1], onChainRef);
    }
    // Multicall
    const mcMatch = sdkContractsContent.match(/Multicall:\s*["'](0x[0-9a-fA-F]{40})["']/);
    if (mcMatch) {
      // Multicall is an external contract, compare against known address
      console.log(`  [INFO] Multicall: ${mcMatch[1]} (external, no on-chain verification)`);
    }
  }
  console.log();

  // ─── 5d. Interface UI — static/markets.ts ───
  console.log("  --- Interface UI: static/markets.ts ---");
  const uiMarketsPath = path.join(monorepoRoot, "0xMarkets-Interface/src/config/static/markets.ts");
  const uiMarketsContent = readFileIfExists(uiMarketsPath);
  if (uiMarketsContent) {
    // Extract market addresses from UI config (they're keys in the object)
    const uiMarketRegex = /["'](0x[0-9a-fA-F]{40})["']\s*:\s*\{/g;
    let uiMatch: RegExpExecArray | null;
    const uiMarkets: string[] = [];
    while ((uiMatch = uiMarketRegex.exec(uiMarketsContent)) !== null) {
      uiMarkets.push(uiMatch[1]);
    }

    for (const onChainMkt of markets) {
      const label = MARKET_LABELS[onChainMkt.marketToken] || onChainMkt.marketToken;
      const found = uiMarkets.find((u) => compareAddresses(u, onChainMkt.marketToken));
      if (found) {
        compare("Interface UI", uiMarketsPath, `${label} market key`, found, onChainMkt.marketToken);
      } else {
        results.push({
          service: "Interface UI",
          file: uiMarketsPath.replace(monorepoRoot + "/", ""),
          field: `${label} market MISSING from UI config`,
          configValue: "NOT FOUND",
          onChainValue: onChainMkt.marketToken,
          status: "MISMATCH",
        });
        console.log(`  [MISMATCH] ${label} market NOT FOUND in UI config`);
      }
    }
  }
  console.log();

  // ─── 5e. Interface — multichain.ts ───
  console.log("  --- Interface: multichain.ts ---");
  const multichainPath = path.join(monorepoRoot, "0xMarkets-Interface/src/config/multichain.ts");
  const multichainContent = readFileIfExists(multichainPath);
  if (multichainContent) {
    // Check CHAIN_ID_PREFERRED_DEPOSIT_TOKEN
    const preferredMatch = multichainContent.match(
      /CHAIN_ID_PREFERRED_DEPOSIT_TOKEN[\s\S]*?\[BASE_SEPOLIA\]:\s*["'](0x[0-9a-fA-F]{40})["']/
    );
    if (preferredMatch) {
      compare(
        "Interface",
        multichainPath,
        "CHAIN_ID_PREFERRED_DEPOSIT_TOKEN (USDC)",
        preferredMatch[1],
        onChainTokens.USDC
      );
    }
  }
  console.log();

  // ─── 5f. Keeper Service — tokens.ts ───
  console.log("  --- Keeper Service: tokens.ts ---");
  const keeperTokensPath = path.join(monorepoRoot, "keeper-service/src/config/tokens.ts");
  const keeperTokensContent = readFileIfExists(keeperTokensPath);
  if (keeperTokensContent) {
    // Extract TOKEN_ADDRESSES
    const keeperTokenRegex = /(\w+):\s*["'](0x[0-9a-fA-F]{40})["']\s*as\s*Address/g;
    let ktMatch: RegExpExecArray | null;
    while ((ktMatch = keeperTokenRegex.exec(keeperTokensContent)) !== null) {
      const symbol = ktMatch[1];
      const configAddr = ktMatch[2];
      if (onChainTokens[symbol] && onChainTokens[symbol] !== "") {
        compare("Keeper Service", keeperTokensPath, `Token ${symbol}`, configAddr, onChainTokens[symbol]);
      }
    }
  }
  console.log();

  // ─── 5g. Keeper Service — .env ───
  console.log("  --- Keeper Service: .env ---");
  const keeperEnvPath = path.join(monorepoRoot, "keeper-service/.env");
  const keeperEnvContent = readFileIfExists(keeperEnvPath);
  if (keeperEnvContent) {
    const envVars: Record<string, string> = {};
    for (const line of keeperEnvContent.split("\n")) {
      const eqIdx = line.indexOf("=");
      if (eqIdx > 0 && !line.startsWith("#")) {
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();
        envVars[key] = val;
      }
    }

    if (envVars.READER_ADDRESS) {
      compare("Keeper Service", keeperEnvPath, "READER_ADDRESS", envVars.READER_ADDRESS, reader.address);
    }
    if (envVars.DATA_STORE_ADDRESS) {
      compare("Keeper Service", keeperEnvPath, "DATA_STORE_ADDRESS", envVars.DATA_STORE_ADDRESS, dataStore.address);
    }
    if (envVars.EVENT_EMITTER_ADDRESS) {
      compare(
        "Keeper Service",
        keeperEnvPath,
        "EVENT_EMITTER_ADDRESS",
        envVars.EVENT_EMITTER_ADDRESS,
        onChainEventEmitter
      );
    }
    if (envVars.LIQUIDATION_HANDLER_ADDRESS) {
      const onChainLH = (await ethers.getContract("LiquidationHandler")).address;
      compare(
        "Keeper Service",
        keeperEnvPath,
        "LIQUIDATION_HANDLER_ADDRESS",
        envVars.LIQUIDATION_HANDLER_ADDRESS,
        onChainLH
      );
    }
    if (envVars.REFERRAL_STORAGE_ADDRESS) {
      compare(
        "Keeper Service",
        keeperEnvPath,
        "REFERRAL_STORAGE_ADDRESS",
        envVars.REFERRAL_STORAGE_ADDRESS,
        onChainRef
      );
    }
    if (envVars.PYTH_LAZER_FEED_PROVIDER_ADDRESS) {
      // Compare against on-chain oracle provider for any token
      const firstTokenWithOracle = Object.entries(oracleConfig).find(
        ([_, addr_]) => addr_ !== ethers.constants.AddressZero
      );
      if (firstTokenWithOracle) {
        compare(
          "Keeper Service",
          keeperEnvPath,
          "PYTH_LAZER_FEED_PROVIDER_ADDRESS",
          envVars.PYTH_LAZER_FEED_PROVIDER_ADDRESS,
          firstTokenWithOracle[1]
        );
      }
    }
  }
  console.log();

  // ─── 5h. Order Execution Keeper — .env ───
  console.log("  --- Order Execution Keeper: .env ---");
  const orderKeeperEnvPath = path.join(monorepoRoot, "order-execution-keeper-service/.env");
  const orderKeeperEnvContent = readFileIfExists(orderKeeperEnvPath);
  if (orderKeeperEnvContent) {
    const envVars: Record<string, string> = {};
    for (const line of orderKeeperEnvContent.split("\n")) {
      const eqIdx = line.indexOf("=");
      if (eqIdx > 0 && !line.startsWith("#")) {
        const key = line.slice(0, eqIdx).trim();
        const val = line
          .slice(eqIdx + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        envVars[key] = val;
      }
    }

    if (envVars.DATA_STORE_ADDRESS) {
      compare("Order Keeper", orderKeeperEnvPath, "DATA_STORE_ADDRESS", envVars.DATA_STORE_ADDRESS, dataStore.address);
    }
    if (envVars.READER_ADDRESS) {
      compare("Order Keeper", orderKeeperEnvPath, "READER_ADDRESS", envVars.READER_ADDRESS, reader.address);
    }
    if (envVars.EVENT_EMITTER_ADDRESS) {
      compare(
        "Order Keeper",
        orderKeeperEnvPath,
        "EVENT_EMITTER_ADDRESS",
        envVars.EVENT_EMITTER_ADDRESS,
        onChainEventEmitter
      );
    }
    if (envVars.DEPOSIT_HANDLER_ADDRESS) {
      const onChainDH = (await ethers.getContract("DepositHandler")).address;
      compare(
        "Order Keeper",
        orderKeeperEnvPath,
        "DEPOSIT_HANDLER_ADDRESS",
        envVars.DEPOSIT_HANDLER_ADDRESS,
        onChainDH
      );
    }
    if (envVars.WITHDRAWAL_HANDLER_ADDRESS) {
      const onChainWH = (await ethers.getContract("WithdrawalHandler")).address;
      compare(
        "Order Keeper",
        orderKeeperEnvPath,
        "WITHDRAWAL_HANDLER_ADDRESS",
        envVars.WITHDRAWAL_HANDLER_ADDRESS,
        onChainWH
      );
    }
    if (envVars.ORDER_HANDLER_ADDRESS) {
      const onChainOH = (await ethers.getContract("OrderHandler")).address;
      compare("Order Keeper", orderKeeperEnvPath, "ORDER_HANDLER_ADDRESS", envVars.ORDER_HANDLER_ADDRESS, onChainOH);
    }
    if (envVars.ADL_HANDLER_ADDRESS) {
      const onChainAH = (await ethers.getContract("AdlHandler")).address;
      compare("Order Keeper", orderKeeperEnvPath, "ADL_HANDLER_ADDRESS", envVars.ADL_HANDLER_ADDRESS, onChainAH);
    }
    if (envVars.PYTH_LAZER_FEED_PROVIDER_ADDRESS) {
      const firstTokenWithOracle = Object.entries(oracleConfig).find(
        ([_, addr_]) => addr_ !== ethers.constants.AddressZero
      );
      if (firstTokenWithOracle) {
        compare(
          "Order Keeper",
          orderKeeperEnvPath,
          "PYTH_LAZER_FEED_PROVIDER_ADDRESS",
          envVars.PYTH_LAZER_FEED_PROVIDER_ADDRESS,
          firstTokenWithOracle[1]
        );
      }
    }
  }
  console.log();

  // ─── 5i. Squid — processor.ts ───
  console.log("  --- Squid: processor.ts ---");
  const squidPath = path.join(monorepoRoot, "0xMarkets-squid/src/processor.ts");
  const squidContent = readFileIfExists(squidPath);
  if (squidContent) {
    const squidEEMatch = squidContent.match(/EVENT_EMITTER_ADDRESS\s*=\s*['"]?(0x[0-9a-fA-F]{40})['"]?/i);
    if (squidEEMatch) {
      compare("Squid", squidPath, "EVENT_EMITTER_ADDRESS", squidEEMatch[1], onChainEventEmitter);
    }
  }
  console.log();

  // ─── 5j. Contracts Repo — config/tokens.ts ───
  console.log("  --- Contracts Repo: config/tokens.ts ---");
  const contractsTokensPath = path.join(contractsRepoRoot, "config/tokens.ts");
  const contractsTokensContent = readFileIfExists(contractsTokensPath);
  if (contractsTokensContent) {
    // Extract baseSepolia section token addresses
    const baseSepoliaSection = contractsTokensContent.match(/baseSepolia:\s*\{([\s\S]*?)\n\s*\},/);
    if (baseSepoliaSection) {
      const section = baseSepoliaSection[1];
      // For baseSepolia tokens, check if they have addresses and match
      const usdcMatch = section.match(/USDC[\s\S]*?address:\s*["'](0x[0-9a-fA-F]{40})["']/);
      if (usdcMatch) {
        compare("Contracts Repo", contractsTokensPath, "USDC address", usdcMatch[1], onChainTokens.USDC);
      }
      const wbtcMatch = section.match(/WBTC[\s\S]*?address:\s*["'](0x[0-9a-fA-F]{40})["']/);
      if (wbtcMatch) {
        compare("Contracts Repo", contractsTokensPath, "WBTC address", wbtcMatch[1], onChainTokens.WBTC);
      }
      const wethMatch = section.match(/WETH[\s\S]*?address:\s*["'](0x[0-9a-fA-F]{40})["']/);
      if (wethMatch) {
        compare("Contracts Repo", contractsTokensPath, "WETH address", wethMatch[1], onChainTokens.WETH);
      }
    }
    // Note: Asset tokens (EUR, GBP, GOLD, JPY) don't have hardcoded addresses in contracts repo
    // They are generated at deploy time via DataStore
    console.log(
      `  [INFO] Synthetic tokens (EUR, GBP, GOLD, JPY) have no hardcoded addresses — they resolve via DataStore`
    );
  }
  console.log();

  // ─── 5k. Docs — keeper-infrastructure.md ───
  console.log("  --- Docs: keeper-infrastructure.md ---");
  const docsPath = path.join(monorepoRoot, "docs/keeper-infrastructure.md");
  const docsContent = readFileIfExists(docsPath);
  if (docsContent) {
    // Extract market addresses from docs
    const docsMarketRegex = /\|\s*(\w+\/\w+)\s*\|[^|]*\|\s*`(0x[0-9a-fA-F]{40})`\s*\|/g;
    let dMatch: RegExpExecArray | null;
    while ((dMatch = docsMarketRegex.exec(docsContent)) !== null) {
      const marketName = dMatch[1];
      const docAddr = dMatch[2];
      // Find corresponding on-chain market by label
      const onChainMkt = markets.find((m) => {
        const label = MARKET_LABELS[m.marketToken];
        return label === marketName || label === marketName.replace("/", "/");
      });
      if (onChainMkt) {
        compare("Docs", docsPath, `${marketName} market address`, docAddr, onChainMkt.marketToken);
      }
    }

    // Extract infrastructure contract addresses
    const docsInfraRegex = /\|\s*(\w+)\s*\|\s*`(0x[0-9a-fA-F]{40})`\s*\|/g;
    const docsInfra: Record<string, string> = {};
    while ((dMatch = docsInfraRegex.exec(docsContent)) !== null) {
      docsInfra[dMatch[1]] = dMatch[2];
    }

    if (docsInfra.DataStore) {
      compare("Docs", docsPath, "DataStore", docsInfra.DataStore, dataStore.address);
    }
    if (docsInfra.EventEmitter) {
      compare("Docs", docsPath, "EventEmitter", docsInfra.EventEmitter, onChainEventEmitter);
    }
    if (docsInfra.Reader) {
      compare("Docs", docsPath, "Reader", docsInfra.Reader, reader.address);
    }
    if (docsInfra.ReferralStorage) {
      compare("Docs", docsPath, "ReferralStorage", docsInfra.ReferralStorage, onChainRef);
    }
    if (docsInfra.PythLazerFeedProvider) {
      const firstTokenWithOracle = Object.entries(oracleConfig).find(
        ([_, addr_]) => addr_ !== ethers.constants.AddressZero
      );
      if (firstTokenWithOracle) {
        compare("Docs", docsPath, "PythLazerFeedProvider", docsInfra.PythLazerFeedProvider, firstTokenWithOracle[1]);
      }
    }

    // Check token addresses in docs
    // Re-scan for token section
    const tokenSection = docsContent.match(/### Token Addresses[\s\S]*?(?=###|$)/);
    if (tokenSection) {
      const tokenRegex = /\|\s*(\w+)(?:\s*\([^)]*\))?\s*\|\s*`(0x[0-9a-fA-F]{40})`\s*\|/g;
      while ((dMatch = tokenRegex.exec(tokenSection[0])) !== null) {
        const symbol = dMatch[1];
        const docAddr = dMatch[2];
        if (onChainTokens[symbol] && onChainTokens[symbol] !== "") {
          compare("Docs", docsPath, `Token ${symbol}`, docAddr, onChainTokens[symbol]);
        }
      }
    }
  }
  console.log();

  // ─── 6. Summary ───
  console.log("─── SECTION 6: Audit Summary ───\n");

  const mismatches = results.filter((r) => r.status === "MISMATCH");
  const matches = results.filter((r) => r.status === "MATCH");

  console.log(`  Total checks: ${results.length}`);
  console.log(`  Matches: ${matches.length}`);
  console.log(`  Mismatches: ${mismatches.length}`);
  console.log();

  if (mismatches.length > 0) {
    console.log("  MISMATCHES FOUND:");
    console.log();
    for (const m of mismatches) {
      console.log(`    Service: ${m.service}`);
      console.log(`    File: ${m.file}`);
      console.log(`    Field: ${m.field}`);
      console.log(`    Config: ${m.configValue}`);
      console.log(`    On-chain: ${m.onChainValue}`);
      console.log();
    }
  } else {
    console.log("  All addresses match on-chain state!");
  }

  // Market health summary
  console.log("─── Market Health Summary ───\n");
  const unhealthyMarkets = marketHealth.filter((m) => !m.healthy);
  if (unhealthyMarkets.length === 0) {
    console.log("  All markets are healthy (non-zero parameters, enabled).");
  } else {
    for (const m of unhealthyMarkets) {
      console.log(`  UNHEALTHY: ${m.label} (${m.market})`);
      if (m.disabled) console.log(`    - Market is DISABLED`);
      if (m.reserveFactorLong === "0") console.log(`    - Reserve Factor (Long) is ZERO`);
      if (m.reserveFactorShort === "0") console.log(`    - Reserve Factor (Short) is ZERO`);
      if (m.oiReserveFactorLong === "0") console.log(`    - OI Reserve Factor (Long) is ZERO`);
      if (m.oiReserveFactorShort === "0") console.log(`    - OI Reserve Factor (Short) is ZERO`);
      if (m.maxPoolAmountLong === "0") console.log(`    - Max Pool Amount (Long) is ZERO`);
      if (m.maxPoolAmountShort === "0") console.log(`    - Max Pool Amount (Short) is ZERO`);
    }
  }
  console.log();

  // Output structured JSON for easy parsing
  console.log("─── JSON OUTPUT ───");
  console.log(
    JSON.stringify(
      {
        blockNumber,
        timestamp: new Date().toISOString(),
        dataStore: dataStore.address,
        reader: reader.address,
        markets: markets.map((m) => ({
          ...m,
          label: MARKET_LABELS[m.marketToken],
        })),
        onChainTokens,
        oracleConfig,
        marketHealth,
        results,
        summary: {
          total: results.length,
          matches: matches.length,
          mismatches: mismatches.length,
        },
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Audit script failed:", error);
  process.exit(1);
});
