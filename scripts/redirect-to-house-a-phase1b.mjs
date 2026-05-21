#!/usr/bin/env node
// Phase 1B — delete artifacts for contracts that hold House B's Layer 1
// (DataStore/RoleStore/EventEmitter) as immutables. On the next
// `hardhat deploy --network baseSepolia` run, hardhat-deploy will see
// no artifact and freshly deploy them against House A's Layer 1
// (sourced from the Phase 1A swapped artifacts).
//
// Verified via constructor-args grep: each of these has House B's
// 0x3B9d71B… DataStore / 0x773C3f69… RoleStore / 0xd5aAfa71…
// EventEmitter baked in. The Reader-family contracts have empty args
// but rely on libraries deployed against House B and need a fresh
// link against the new Layer 1 to expose ladder-aware getters.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..", "deployments", "baseSepolia");

const DELETIONS = [
  // Entry-point routers
  "ExchangeRouter.json",
  "SubaccountRouter.json",
  "GelatoRelayRouter.json",
  "SubaccountGelatoRelayRouter.json",
  "GlvRouter.json",

  // Handlers (operate on vaults + DataStore)
  "DepositHandler.json",
  "WithdrawalHandler.json",
  "OrderHandler.json",
  "AdlHandler.json",
  "LiquidationHandler.json",
  "ShiftHandler.json",
  "SwapHandler.json",
  "GlvHandler.json",

  // Readers (view-only but link against libraries that need ladder support)
  "Reader.json",
  "GlvReader.json",
  "ChainReader.json",

  // Config / Timelock — hold House B Layer 1 as immutables
  "Config.json",
  "Timelock.json",

  // Misc helpers that wire to House B Layer 1
  "AutoCancelSyncer.json",
  "TimestampInitializer.json",
];

let deleted = 0;
let missing = 0;

for (const filename of DELETIONS) {
  const p = path.join(ROOT, filename);
  if (!fs.existsSync(p)) {
    console.warn(`MISSING ${filename}`);
    missing++;
    continue;
  }
  fs.unlinkSync(p);
  console.log(`DELETE  ${filename}`);
  deleted++;
}

console.log(`\nDone. deleted=${deleted} missing=${missing}`);
