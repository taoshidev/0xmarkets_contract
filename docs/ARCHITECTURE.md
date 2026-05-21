# Contract Architecture & Upgrade Discipline

This doc captures how the 0xMarkets contracts are layered, why some addresses
have to stay frozen forever, and how to ship features without stranding LP
funds.

Read this before:
- Adding any new contract that holds value
- Changing anything in `contracts/data/`, `contracts/role/`, `contracts/market/`, `contracts/error/`
- Running `hardhat deploy --network baseSepolia` or any mainnet equivalent

---

## The three-layer model

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 1 — FOUNDATION  (immutable, deployed once)            │
│                                                              │
│   RoleStore     DataStore     MarketFactory     MarketToken  │
│   (permissions) (storage)     (creates markets) (LP shares)  │
│                                                              │
│   Holds: all permissions, all state, all money, all LP shares│
│   Rule:  Never redeploy. Never change source. Pin addresses. │
└──────────────────────────────────────────────────────────────┘
                              ▲
                              │ reads / writes
                              │
┌──────────────────────────────────────────────────────────────┐
│  LAYER 2 — LOGIC  (mutable, redeploy freely)                 │
│                                                              │
│   Config       OrderHandler      LiquidationHandler          │
│   Reader       DepositHandler    WithdrawalHandler           │
│   Router       AdlHandler        SwapHandler                 │
│   Vaults       Oracle adapters   ConfigValidatorUtils        │
│                                                              │
│   Holds: nothing persistent. Pure logic.                     │
│   Rule:  Redeploy on every feature. Swap roles to update.    │
└──────────────────────────────────────────────────────────────┘
                              ▲
                              │ called by
                              │
┌──────────────────────────────────────────────────────────────┐
│  LAYER 3 — ENTRYPOINTS  (mutable, thin)                      │
│                                                              │
│   ExchangeRouter, SubaccountRouter, GelatoRelayRouter, etc.  │
│                                                              │
│   Holds: nothing. Just routes calls to Layer 2.              │
│   Rule:  Redeploy when their interface changes.              │
└──────────────────────────────────────────────────────────────┘
```

---

## Why Layer 1 is sacred

### 1. DataStore holds all protocol state

Every market config, every position, every LP balance, every funding
accumulator, every key the protocol reads — lives in DataStore's mappings.
A new DataStore is an empty database. No markets, no positions, no liquidity.

If DataStore moves, every Layer 2 contract pointing at it suddenly sees
"protocol has zero state." LPs can no longer interact via the new contracts.
Their funds are still on chain in the OLD DataStore / OLD MarketTokens, but
the protocol's logic has stopped reading from there.

### 2. MarketToken's address is derived from Layer 1

Each market is a `MarketToken` contract deployed via `CREATE2` by
`MarketFactory.createMarket()`. The address is:

```
keccak256(0xff || factory_address || salt || keccak256(creationCode))
```

The `creationCode` is `MarketToken`'s compiled bytecode plus its constructor
args. The constructor takes `(RoleStore, DataStore)` as arguments and
embeds them as immutables — meaning **the RoleStore and DataStore addresses
are baked into MarketToken's bytecode as 20-byte literals**.

Consequence: if `RoleStore` or `DataStore` ever changes address, every
MarketToken's CREATE2 derivation also changes. New addresses for every
market. LP funds stranded in the old MarketTokens.

### 3. MarketTokens hold the actual money

Each MarketToken's contract balance IS the pool. When Alice deposits $1k of
USDC into the ETH/USD market, the USDC sits as
`USDC.balanceOf(ETH_market_address)`. Her LP share is
`ETH_market_address.balanceOf(Alice)` (it's an ERC-20).

If the MarketToken's CREATE2 address changes, the new MarketToken is at a
different address with zero balance. The USDC and Alice's share are still
sitting at the OLD address, but no Layer 2 contract knows about them
anymore.

---

## The three rules

### Rule 1 — All state lives in Layer 1

Layer 2 and Layer 3 contracts hold **nothing persistent**. They are pure
functions over Layer 1's state. If you deleted every Layer 2 contract
tomorrow, no value would be lost — you'd just lose the ability to interact
until new Layer 2 contracts were deployed and granted roles.

This is the property that makes Layer 2 freely replaceable.

### Rule 2 — Layer 1 addresses are commitments

Once a Layer 1 contract is deployed, its address is part of the protocol's
identity. Treat it like the chain ID. Document it. Lock it. Never let
`hardhat deploy` redeploy it accidentally.

In `deploy/` scripts, Layer 1 contracts should use `skipIfAlreadyDeployed: true`
(or equivalent) so the script reuses the existing address even when its
bytecode appears to have drifted. If it would actually need to redeploy,
the script should ERROR rather than silently create a new address.

### Rule 3 — Features ship in Layer 2

Every new feature goes in:
- A new Layer 2 contract, OR
- A new method on an existing Layer 2 contract, OR
- A new utility/library file that NO Layer 1 contract imports

The Layer 1 source code stays untouched. Its bytecode stays unchanged. Its
addresses stay unchanged. Markets stay put. LPs don't notice.

---

## What "doesn't change MarketToken bytecode" actually requires

Three things must remain stable for MarketToken's compiled bytecode to be
byte-identical across deploys:

### A. RoleStore + DataStore addresses (constructor immutables)

Already covered. Keep them frozen.

### B. The transitive import graph

`MarketToken.sol` imports:
- `ERC20` from OpenZeppelin (pinned via `package.json`)
- `Bank.sol` → `RoleModule.sol` → `Errors.sol` + RoleStore
- `Bank.sol` → `TokenUtils.sol` → ...

**Any file in this graph that changes will change MarketToken's bytecode.**

The two files most frequently touched by feature PRs are:
- `contracts/error/Errors.sol`
- `contracts/data/Keys.sol`

Both are in MarketToken's transitive import graph (via Bank → RoleModule).
So adding a new error or a new key to either of these files is enough to
ripple through MarketToken's bytecode.

**Rule:** when adding new errors or new keys for a feature, put them in a
NEW file with a feature-specific name. Examples:
- `contracts/error/LeverageLadderErrors.sol`
- `contracts/data/LeverageLadderKeys.sol`

Import those new files only into the new logic contracts that need them.
`Errors.sol` and `Keys.sol` stay frozen.

### C. The Solidity metadata hash

Every compiled contract has a ~53-byte CBOR metadata blob at the end of its
bytecode. It encodes a hash of all input source files seen by the compiler.
Any edit to any source file in MarketToken's compile graph — even a comment
or whitespace — changes this hash and therefore changes MarketToken's
bytecode.

**Fix:** strip the metadata hash in `hardhat.config.ts`:

```ts
solidity: {
  settings: {
    metadata: {
      bytecodeHash: "none"
    }
  }
}
```

After this, bytecode equality depends only on actual code, not on
incidental source edits. Etherscan source verification still works via the
standard input-JSON method.

---

## The pre-PR checklist

Before opening any PR that touches contracts, walk through this list. Stop
at the first "no" and resolve before continuing.

1. **Does this PR modify `DataStore.sol`, `RoleStore.sol`, `MarketFactory.sol`,
   or `MarketToken.sol` source?** If yes, this is a major version migration.
   Read the migration section below. Plan with the team before continuing.

2. **Does this PR modify a file that MarketToken transitively imports?**
   (`Bank.sol`, `RoleModule.sol`, `Errors.sol`, `Keys.sol`,
   `TokenUtils.sol`, any oracle types those touch.) If yes, move the change
   to a NEW file instead.

3. **Is `bytecodeHash: "none"` set in `hardhat.config.ts`?**
   Status as of May 2026: **NOT set.** First contract PR after this doc lands
   should add it under `solidity.settings.metadata`.

4. **Is the Solidity version pinned in `hardhat.config.ts`?**
   Status as of May 2026: ✅ Pinned to exact `0.8.24`. No action needed
   unless a future PR changes it.

5. **Is OpenZeppelin version pinned in `package.json`?**
   Status as of May 2026: ✅ Pinned to exact `4.9.3` (via the
   `@openzeppelin/contracts-v4` npm alias). No action needed unless a future
   PR changes it.

6. **Is the deploy script using `skipIfAlreadyDeployed: true` for Layer 1
   contracts?**
   Status as of May 2026: **NOT used in any `deploy/*.ts` script.** First
   contract PR after this doc lands should add it for DataStore, RoleStore,
   MarketFactory, and any other Layer 1 deploy steps.

7. **Has CI run a bytecode-drift check?** Compare the new compiled
   bytecode for `MarketToken`, `MarketFactory`, `DataStore`, `RoleStore`
   to what's on chain at the existing addresses. If anything differs, the
   PR must explain why.

If all clear: ship it. Markets stay put. Deploy only writes the new Layer 2
contracts, grants their roles, revokes the old contracts' roles. Frontend
SDK updates only handler/router addresses, not market addresses.

---

## When you must touch Layer 1

Sometimes it's unavoidable. Example: a new immutable on MarketToken, a
storage layout change to DataStore, an interface change on MarketFactory.
In those cases, plan a migration before the deploy. **Don't ship the
upgrade and then realize you stranded LP funds.**

### Migration pattern

1. Deploy new Layer 1 contracts alongside the old ones. Both live on chain.
2. Deploy a `Migration` contract with two privileged functions:
   - `redeemFromOldMarket(oldMarket, amount)` — burns LP shares in old
     MarketToken, recovers underlying USDC.
   - `depositToNewMarket(newMarket, amount)` — deposits the recovered USDC
     into the new MarketToken, mints new LP shares.
3. The Migration contract gets temporary CONTROLLER role on both old and
   new Layer 1. Frontend exposes a one-click "migrate position" button.
4. Open a 30-day migration window. During the window, both old and new
   markets work but new markets are where prices and volume flow.
5. After the window, deprecate the old infrastructure. Anyone who hasn't
   migrated keeps their funds in the old contracts (they can still manually
   redeem at the old MarketToken address) but receives no further protocol
   support.

This is the only honest way to upgrade Layer 1 when LPs are involved. It
costs weeks of coordination. Plan accordingly.

### Migration on testnet

For testnet, the migration is usually not built — testers re-deposit using
the faucet. Document this clearly: "we redeployed Layer 1 on $DATE,
please re-deposit from the faucet."

---

## Layer 1 reference (Base Sepolia, May 2026)

Current canonical addresses, verified against `deployments/baseSepolia/`.
These are sacred — they should never change unless a deliberate Layer 1
migration is happening.

| Contract | Address |
|---|---|
| DataStore | `0x3B9d71B497aD2d3c32a7c24e96565f84a58089a7` |
| RoleStore | `0x773C3f6973064FD877FE5DF4f762Fe57C8F2Fd47` |
| MarketFactory | `0x3B377D4712c17285Abcb76DAEBd713e23E64dCF1` |

Update this table whenever Layer 1 is intentionally redeployed.

### Note on the parallel deployment (`0x0cA7D71…`)

A second DataStore exists at `0x0cA7D71845cb485B7593bBdCbcac93d82d52d053` on
Base Sepolia. It is NOT in this contract repo's deployments folder. It was
deployed separately at some point (likely for a UI rebrand demo around
Mar 2026) and the frontend SDK pointed at it for months without anyone
syncing the two.

In May 2026 we updated the frontend SDK to point at this repo's canonical
DataStore (`0x3B9d71B…`). The visible market addresses changed as a result.
This was a one-time reconciliation, not a Layer 1 redeploy. The contract
repo's Layer 1 has been stable since PR #20 (commit `578b8652`).

Going forward, **only `0x3B9d71B…` is canonical.** Treat the
`0x0cA7D71…` deployment as deprecated infrastructure that nothing reads
from anymore. Any LP funds stuck there are reachable only via direct
contract calls on the old MarketTokens.

---

## Common feature scenarios

How each maps to the architecture:

| Feature | Layer 1 changes? | What you add |
|---|---|---|
| New leverage ladder | No | `LeverageLadderUtils.sol` (new library), new keys in `LeverageLadderKeys.sol`, ladder rows pushed to existing DataStore via Config setter |
| New funding rate algorithm | No | New `FundingHandler` Layer 2 contract; old handler's CONTROLLER role revoked |
| New oracle source | No | New oracle adapter; price data still flows into existing DataStore keys |
| New fee schedule | No | Config setter writes new values to existing DataStore keys |
| New market for new token pair | No | `MarketFactory.createMarket(newIndex, newLong, newShort)` deploys a new MarketToken via CREATE2; that's the SAME factory, so the existing Layer 1 is preserved |
| Change how LP shares mint/burn | **Yes** | Migration required |
| Add immutable to MarketToken | **Yes** | Migration required |
| Change DataStore storage layout | **Yes** | Migration required |
| Add a new state variable to RoleStore | **Yes** | Migration required |

If the feature is in the top half, ship it through the pre-PR checklist
and you're done in a normal cycle.

If it's in the bottom half, treat it as a major release. Build the
migration. Communicate with users. Schedule the deploy carefully.

---

## What success looks like

You'll know the discipline is working when:

- **Months of feature PRs ship without market addresses ever changing.** The frontend SDK has stable market addresses for a year+. Only handler/router addresses change between releases.
- **Users don't notice upgrades.** Their portfolios stay populated. Their open orders persist. Their LP balances continue accumulating fees through the upgrade.
- **The deploy script is boring.** It reuses Layer 1, deploys new Layer 2, grants roles, revokes old roles, and exits.
- **External integrators (analytics sites, indexers, partners) don't need to update anything** when you ship features. Their market addresses are still correct.

If any of those break: review which rule was violated and tighten up.

---

## Recovery test

A good self-check: **could a junior dev rebuild the frontend from scratch
using only on-chain queries?**

If yes, your architecture is sound:
- All markets are discoverable from MarketFactory or DataStore.
- All market state is queryable through Reader → DataStore.
- All LP balances are queryable through MarketToken's ERC-20 interface.
- All positions/orders are queryable through DataStore.

If no, something is off-chain that shouldn't be — and that something will
hurt during the next upgrade.

---

## Owners

- **Layer 1 changes:** require contract lead + protocol lead sign-off. Treat
  as major version bumps.
- **Layer 2 / Layer 3 changes:** normal PR review.
- **This doc:** updated whenever the architecture changes, the canonical
  Layer 1 addresses change, or the checklist is improved.

---

## Postmortem — May 2026 deploy

This doc was written after a confusing deploy event. Posting it for future
readers so the lesson sticks.

### What actually happened

The May deploy (commit `e9b7c3a9 "deployed to testnet"`) was the shipping
event for the leverage ladder feature. It was *internally* well-behaved:

- Hardhat-deploy reused the existing DataStore `0x3B9d71B…` (it had been at
  that address since PR #20).
- Reused MarketFactory at `0x3B377D…` and RoleStore at `0x773C3f…`.
- Reused all 9 existing MarketTokens at their existing addresses.
  `deploy/deployAndConfigureMarkets.ts` checks `getOnchainMarkets(…)` and
  skips creation for any market that already exists in the on-chain
  MarketStore.
- Deployed only NEW Layer 2 contracts: Config, PositionUtils, OrderHandler,
  LiquidationHandler, AdlHandler, Reader, etc. (each because their bytecode
  changed due to the ladder additions).

By the rules of this doc, that's a clean Layer 2 upgrade.

### What about Keys.sol / Errors.sol changes in the ladder PR?

The leverage ladder PR (#27) added new constants to `Keys.sol` and a new
error to `Errors.sol`. Both files are in MarketToken's transitive compile
graph. **In principle, this should have changed MarketToken's compiled
bytecode.** Strictly by the rules of this doc, that's a Layer 1 graph
violation.

It didn't bite in May because the deploy script's "skip if exists" logic
prevented any MarketToken from being re-instantiated. The new bytecode
sat in `artifacts/` unused; the on-chain MarketTokens kept their old
bytecode from their original deploy.

**The latent risk:** if someone ever did a fresh deploy from zero (no
existing `deployments/baseSepolia/` artifacts, no on-chain markets), the
new MarketTokens would have different addresses than the current ones,
because the ladder PR's additions to Keys/Errors changed MarketToken's
compiled bytecode. The "skip if exists" logic only protects you when prior
state exists to skip over.

This is exactly why the doc's Rule 3 (new errors/keys go in new files,
not in `Errors.sol` / `Keys.sol`) matters — to remove the latent risk for
all future PRs.

### Why it FELT like markets had moved

The frontend SDK had been pointing at a separate parallel deployment
(DataStore `0x0cA7D71…`) for months. Nobody had reconciled it with the
contract repo's deployment.

When we updated the frontend SDK to point at this repo's deployment
(`0x3B9d71B…`), the visible market addresses appeared to change overnight:
- Old visible WETH market: `0x23F40e…` (in the parallel deployment)
- New visible WETH market: `0x04bbdaA…` (in this repo's deployment)

But these markets had both existed all along. We just switched which
deployment the frontend looked at. **No CREATE2 cascade. No re-derivation.
Just a sync.**

### What the bytecode diff showed (and why)

A byte diff between `0x23F40e…` (old visible WETH) and `0x04bbdaA…` (new
visible WETH) shows the DataStore immutable embedded inside each — `0x0cA7D71…`
in one, `0x3B9d71B…` in the other. That's correct — those MarketTokens were
deployed by different factories pointing at different DataStores.

The diff is real, but it's a diff between two long-standing parallel
deployments, NOT between "before May deploy" and "after May deploy" of the
same deployment. Important distinction.

### The actual lesson

Two parallel deployments existed and drifted unchecked. The doc you're
reading is the response: pick one canonical deployment, sync everything to
it, never let them drift again. Then the discipline this doc describes —
preserving Layer 1 across feature releases — has a single source of truth
to protect.

If we hadn't had the parallel-deployment problem, the May deploy would have
shipped invisibly. No "where did my markets go" moment.

### Followups the May deploy made clear

1. Add `bytecodeHash: "none"` to `hardhat.config.ts`.
2. Add `skipIfAlreadyDeployed: true` to Layer 1 deploy steps.
3. Add a CI bytecode-drift check (compare new compiled bytecode for
   DataStore, RoleStore, MarketFactory, MarketToken against current on-chain
   bytecode at the canonical addresses).
4. Document address sources of truth — frontend SDK pulls from
   `deployments/baseSepolia/` directly or via a generated JSON, never
   hand-edited.

---

## Verification log (May 2026)

Claims in this doc were cross-checked against the codebase at the May 2026
deploy commit. Reproduce any time with the commands below.

### Inheritance + immutables

`MarketToken` → extends `Bank` → extends `RoleModule`. Constructor takes
`(RoleStore, DataStore)`. Bank stores `DataStore public immutable dataStore`.
RoleModule stores `RoleStore public immutable roleStore`. Both immutables
end up in MarketToken's deployed bytecode.

```bash
grep -n "immutable" contracts/bank/Bank.sol contracts/role/RoleModule.sol
```

### Import graph reaching `Errors.sol` + `Keys.sol`

MarketToken's compile graph touches both via:
- `Bank.sol` → `TokenUtils.sol` → `Keys.sol`
- `Bank.sol` → `RoleModule.sol` → `RoleStore.sol` → `Errors.sol`

Reproduce:
```bash
grep -rn "^import" contracts/bank/ contracts/role/ contracts/token/TokenUtils.sol
```

### MarketFactory uses CREATE2

`MarketFactory.createMarket()` deploys MarketTokens via `new MarketToken{salt: salt}(...)`.
That's Solidity's CREATE2 syntax.

```bash
grep -n "salt:" contracts/market/MarketFactory.sol
```

### Current toolchain

- `hardhat-deploy: ^0.11.25` (from `package.json`)
- Solidity: `0.8.24` exact (from `hardhat.config.ts`)
- OpenZeppelin: `4.9.3` exact (npm alias `@openzeppelin/contracts-v4`)
- Optimizer: enabled, `runs: 10`
- Metadata hash: NOT stripped (no `bytecodeHash: "none"`)
- `skipIfAlreadyDeployed`: not used in any `deploy/*.ts`

Reproduce:
```bash
grep -A 3 "solidity:" hardhat.config.ts
grep -rn "skipIfAlreadyDeployed" deploy/
grep "openzeppelin\|hardhat-deploy" package.json
```

### Layer 1 addresses

Read from `deployments/baseSepolia/`:
```bash
for n in DataStore RoleStore MarketFactory; do
  python3 -c "import json; print('$n:', json.load(open('deployments/baseSepolia/$n.json'))['address'])"
done
```

Re-run after any future deploy to confirm Layer 1 didn't move.

Last updated: May 2026.
