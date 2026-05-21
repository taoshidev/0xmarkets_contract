#!/usr/bin/env node
// One-shot: redirect hardhat-deploy artifacts from House B to House A.
// Phase 1A — address-only swaps for contracts that exist live on House A
// and that we want to keep using as-is. Run from the contract repo root.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..", "deployments", "baseSepolia");

// House A addresses (sourced from 0xMarkets-Interface/docs/CONTRACT_ADDRESSES.md
// and cross-checked on-chain via cast call against the Base Sepolia RPC).
const SWAPS = {
  // Layer 1 — pinned in .migrations.json (will never re-deploy regardless).
  "DataStore.json": "0x0cA7D71845cb485B7593bBdCbcac93d82d52d053",
  "RoleStore.json": "0xa5fCcD8Eba314B08cF6f637C390f78693Eb1289C",
  "MarketFactory.json": "0x60418A0f55d73b086530C9CFDA3cd7bc47a68a66",
  "EventEmitter.json": "0x68001935Ec7C2e3980f99435db3CabC89dea602B",

  // Vaults — pinned in .migrations.json.
  "DepositVault.json": "0x590d1d8e50A3a3d9F3448657D1Cb64D486978781",
  "WithdrawalVault.json": "0xE47130E74CAEd3Cae1Bf2c7e1e0af0B592354b57",
  "OrderVault.json": "0x76DE02F06979a24A87F2cD743Ab533a44EdcFb08",
  "ShiftVault.json": "0xEF60117684991C41dea18de53446c437462d07cc",
  "GlvVault.json": "0x5fEb1eF511E953dec5E016bFF32F8987cE6eD33a",

  // Oracle providers — pinned in .migrations.json.
  "Oracle.json": "0x03F2a8b7D07D937a0568459a0a1299E4d2BECFAA",
  "OracleStore.json": "0xeC8a60bFCF09f6788AE8c639E4A8a073f9D12512",
  "PythLazerFeedProvider.json": "0x31060bBaD18D4a13Db2e66eD7b562968e93f1312",
  "PythHermesFeedProvider.json": "0x75bB00982A8855C5469A5B08D16422C0316d9f9c",
  "ChainlinkPriceFeedProvider.json": "0xe0A7f2a21373128DB38b55a6FEb081C6BCDCC22E",

  // Singletons — pinned in .migrations.json (Router=SyntheticsRouter).
  "ExternalHandler.json": "0xfcD54e4D5ECA91abbB18CA9429369617730F4395",
  "ReferralStorage.json": "0x29D5533a26ac87C28972d277CEFf2EC00843c5A7",
  "GovToken.json": "0xA24dff4D381f97e9cb4DA7fb7b50505390cda522",
  "Multicall3.json": "0xdD6E2999d0a882886A50c031c7a117058B4aCB5f",
  "FeeHandler.json": "0xe6012FD0C1B0c9f10CBAFcD2e7A8Bf69FB8BBd4A",
  "Router.json": "0xE92B08345125dc77eB071d1a2D513751C4D22714",
  "GlvFactory.json": "0x033B8d2cCD0c72C78013E675039D0e7BDe30f9F1", // kept as-is for now

  // Synthetic asset tokens (AssetToken contract instances).
  "Euro.json": "0x18909CC26672376e8FDF1fa54Fc5B892dd6E2b0C",
  "British Pound.json": "0xf7255EAb2968Fb6B8b6226eB25c6EDC2F1CcE60a",
  "Gold.json": "0xf4ac308123764edFB7453a7446D01277D7DEa1A7",
  "Silver.json": "0x25f79151C3E00ba7710EcF02192836994E36b440",
  "Japaness Yen.json": "0x7836DF766375f02D71fa3617F5F06a0712699A81",
  "West Texas Intermediate.json": "0x4B4A8E5a0deEC8611e647255425eC68A846046d4",
};

let swapped = 0;
let skipped = 0;
let missing = 0;

for (const [filename, newAddress] of Object.entries(SWAPS)) {
  const p = path.join(ROOT, filename);
  if (!fs.existsSync(p)) {
    console.warn(`MISSING  ${filename}`);
    missing++;
    continue;
  }
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const oldAddress = j.address;
  if (oldAddress?.toLowerCase() === newAddress.toLowerCase()) {
    console.log(`unchanged ${filename}`);
    skipped++;
    continue;
  }
  j.address = newAddress;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  console.log(`SWAP     ${filename.padEnd(40)} ${oldAddress} → ${newAddress}`);
  swapped++;
}

console.log(`\nDone. swapped=${swapped} unchanged=${skipped} missing=${missing}`);
