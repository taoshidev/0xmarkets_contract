# Deployment Process

How to ship a contract change to Base Sepolia (and, with care, to mainnet)
without stranding LP funds or breaking the frontend.

> Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) first if you haven't. This doc
> covers the *operational* steps; the architecture doc covers *why* the
> operational steps exist.

---

## TL;DR

A clean release looks like:

```bash
# 1. Pre-flight
git status                          # working tree clean
git branch --show-current           # on the branch you intend to ship
npx hardhat compile                 # no Solidity errors

# 2. Deploy
ACCOUNT_KEY=0x... npx hardhat deploy --network baseSepolia

# 3. Commit the artifact changes
git add deployments/baseSepolia/
git commit -m "deployed to testnet"

# 4. Sync frontend SDK + keeper services with the new Layer 2/3 addresses
#    (see the "Syncing downstream" section below)
```

If anything in the deploy output looks off — abort and read the
[red flags](#red-flags) section.

---

## Before you start

### 1. PR checklist

Run through the [Pre-PR checklist in ARCHITECTURE.md](./ARCHITECTURE.md#the-pre-pr-checklist).
Stop at the first "no" and resolve before continuing. The two checks people
most often skip:

- Does your PR add a new entry to `contracts/data/Keys.sol` or
  `contracts/error/Errors.sol`? If yes, move the new entry into a
  feature-specific file (e.g., `LeverageLadderKeys.sol`,
  `InsuranceFundErrors.sol`) and import it only into the new Layer 2
  contracts that need it. Editing the shared files ripples bytecode through
  every contract that imports them, including `MarketToken`.
- Does your PR modify any of the
  [sacred Layer 1 files](./ARCHITECTURE.md#what-doesnt-change-markettoken-bytecode-actually-requires)?
  If yes, this is a Layer 1 migration — different process, see the
  [Layer 1 changes](#layer-1-changes-special-case) section.

### 2. Deployer wallet

Deploys are signed by a wallet whose private key is read from the
`ACCOUNT_KEY` env var (see `hardhat.config.ts` → `getEnvAccounts`).

Before deploying:

- **Funds.** The wallet needs a few hundredths of ETH on Base Sepolia. A
  full Layer 2/3 redeploy uses roughly `0.01–0.03 ETH`. Check with
  `cast balance --rpc-url https://sepolia.base.org <DEPLOYER_ADDRESS>`.
- **Roles.** The deployer needs `ROLE_ADMIN` on the live `RoleStore` so
  `grantRoleIfNotGranted(...)` in deploy scripts can grant `CONTROLLER` to
  the new Layer 2 contracts. Verify with:

  ```bash
  cast call --rpc-url https://sepolia.base.org \
    0xa5fCcD8Eba314B08cF6f637C390f78693Eb1289C \
    "hasRole(address,bytes32)(bool)" \
    <DEPLOYER_ADDRESS> \
    $(cast keccak $(cast abi-encode "f(string)" "ROLE_ADMIN"))
  ```

  Expect `true`.

### 3. Working tree

- `git status` must show no untracked changes to `deployments/baseSepolia/`
  before you start. If anything is dirty there, commit or stash it first.
  Otherwise you can't tell which artifact changes came from this deploy vs
  earlier work.
- Confirm you're on the branch you intend to ship. The deploy is destructive
  to artifacts — you don't want it landing on the wrong branch.

---

## Running the deploy

### The command

```bash
npx hardhat deploy --network baseSepolia
```

The deploy is *idempotent at the framework level*:

- Layer 1 contracts (`DataStore`, `RoleStore`, `MarketFactory`,
  `EventEmitter`, vaults, oracle providers, `GovToken`, etc.) are pinned in
  `deployments/baseSepolia/.migrations.json` with their `id`s
  (`DataStore_3`, `RoleStore_3`, etc.). hardhat-deploy sees the pin and
  skips them — regardless of whether the local bytecode would compare equal.
- Layer 2/3 contracts use bytecode comparison: if the on-chain bytecode at
  the address in their artifact matches what HEAD compiles, hardhat-deploy
  skips. If it differs (because the contract was changed in this PR), it
  redeploys at a *new* address and overwrites the artifact.
- `deploy/deployAndConfigureMarkets.ts` reads the live market registry from
  `DataStore` and skips any market that already exists. You will NOT
  accidentally create duplicate markets.

### Optional flags

| Flag | When to use |
|---|---|
| `--tags <TagName>` | Run only deploy steps tagged with `<TagName>` (e.g., `--tags ExchangeRouter` to redeploy just one contract). Useful for surgical fixes. |
| `SKIP_NEW_MARKETS=true` env var | Set this when you've added a new market to `config/markets.ts` but want this deploy to skip market creation (rare — only if you want to deploy code first, markets later). |

### What the output should look like

The deploy logs each step. Mentally bucket each line into one of three
categories:

| You see | Means | Reaction |
|---|---|---|
| `reusing "DataStore" at 0x0cA7D71…` | A pinned or bytecode-matched contract was skipped | ✅ expected |
| `deploying "ExchangeRouter" (tx: 0x…) deployed at 0x… with NNN gas` | A Layer 2/3 contract was changed by this PR and got redeployed | ✅ expected, note the new address |
| `market WETH/USD [USD0-USD0] already exists at 0x23F40e…` | Market is in DataStore, will not be re-created | ✅ expected |
| `creating market XYZ` | A NEW market is being created via `MarketFactory.createMarket` | ✅ expected ONLY if you added a market to `config/markets.ts`; ❌ red flag if you didn't |
| `setting leverage ladder for market 0x…` (or similar feature config push) | The deploy script is updating a feature-specific DataStore key | ✅ expected if your PR added this feature |

### Red flags

**Abort with Ctrl-C if you see any of these:**

- `deploying "DataStore"`, `deploying "RoleStore"`, `deploying "MarketFactory"`,
  or `deploying "EventEmitter"`. These are pinned. If they're trying to
  redeploy, something has broken the pin. Stop and investigate before they
  succeed and strand all LP funds.
- `deploying "Euro"`, `deploying "British Pound"`, `deploying "Gold"`,
  `deploying "Silver"`, `deploying "Japaness Yen"`, or `deploying "West Texas Intermediate"`.
  These are the synthetic asset tokens that back the markets. If they
  redeploy at new addresses, every market that references the old token
  becomes orphaned. (See the open follow-up: add
  `skipIfAlreadyDeployed: true` to `deploy/deployAndConfigureAssetTokens.ts`
  to make this impossible.)
- `creating market <name>` when you didn't add a market in this PR. Means
  something in `config/markets.ts` doesn't match what's already in DataStore,
  or the deploy is reading a different DataStore than you think it is.
- A transaction reverting with `Unauthorized` or `RoleAdminNotGranted`.
  Means the deployer lost a role since the last successful deploy. Don't
  re-run blindly; investigate.
- Any output mentioning a DataStore address other than
  `0x0cA7D71845cb485B7593bBdCbcac93d82d52d053` on baseSepolia. That's the
  canonical House A DataStore; any other value means an artifact is
  pointing at a stale or orphaned deployment.

### If you have to abort mid-deploy

Hit Ctrl-C. The deploy is mostly idempotent — anything that completed got
committed to chain and to the artifact JSON. Anything that didn't is just
skipped on the next run. The risky case is being interrupted *between*
"contract deployed" and "afterDeploy granted its role" — fix that by re-running
the deploy, which will see the artifact, skip the deploy, and re-execute the
idempotent `grantRoleIfNotGranted` afterwards.

---

## After the deploy

### 1. Verify on-chain

Pick a handful of the freshly deployed Layer 2/3 contracts and confirm
they're wired to the canonical Layer 1:

```bash
RPC=https://sepolia.base.org
HOUSE_A_DATA_STORE=0x0cA7D71845cb485B7593bBdCbcac93d82d52d053

for f in ExchangeRouter OrderHandler Reader Config DepositHandler WithdrawalHandler LiquidationHandler; do
  addr=$(node -e "console.log(JSON.parse(require('fs').readFileSync('deployments/baseSepolia/$f.json','utf8')).address)")
  ds=$(cast call --rpc-url $RPC $addr 'dataStore()(address)' 2>/dev/null || echo "n/a (no getter)")
  echo "$f $addr → dataStore=$ds"
done
```

Every reported `dataStore()` should equal `$HOUSE_A_DATA_STORE`. If any
differ, the contract was deployed against the wrong DataStore — investigate
before continuing.

### 2. Verify feature config

If your PR added a feature that writes to DataStore (leverage ladder,
insurance fund, fee buckets, …), read at least one key back to confirm the
push actually landed. Example for the ladder:

```bash
LADDER=$(cast keccak $(cast abi-encode "f(string)" "LEVERAGE_LADDER_TIER_COUNT"))
WETH_MARKET=0x23F40e3279685413b252A6944AF9a0641D3aa6ce
SLOT=$(cast keccak $(cast abi-encode "f(bytes32,address)" $LADDER $WETH_MARKET))
cast call --rpc-url $RPC $HOUSE_A_DATA_STORE "getUint(bytes32)(uint256)" $SLOT
# Expect a non-zero tier count
```

### 3. Commit the artifact changes

```bash
git add deployments/baseSepolia/
git commit -m "deployed to testnet"
```

This is what makes the deploy reproducible. Without committing, anyone
checking out the branch later won't see the new Layer 2/3 addresses and
the next `hardhat deploy` will try to redeploy them.

---

## Syncing downstream

A successful contract deploy means Layer 2/3 addresses changed. The
frontend and keeper services hardcode those addresses and need updating.

### Frontend (`0xMarkets-Interface`)

Update `sdk/src/configs/contracts.ts` → `CONTRACTS[BASE_SEPOLIA]` with the
new addresses. Common ones to check after a normal release:

- `ExchangeRouter`
- `SubaccountRouter`
- `SyntheticsReader` (and `Reader`, which is the same address)
- `GlvReader`, `GlvRouter`
- `GelatoRelayRouter`, `SubaccountGelatoRelayRouter`
- `Timelock` (if you redeployed it)

Then regenerate the prebuilt cache:

```bash
cd 0xMarkets-Interface
yarn prebuild
yarn tscheck
```

The prebuild rewrites `sdk/src/prebuilt/hashedMarketConfigKeys.json` and
friends. If `yarn tscheck` fails on something not related to your changes,
the error is pre-existing — confirm with `git stash && yarn tscheck` before
fixing.

### Keeper service (`keeper-service`)

Update `keeper-service/.env`:

- `READER_ADDRESS` — set to the new Reader from `deployments/baseSepolia/Reader.json`
- `LIQUIDATION_HANDLER_ADDRESS` — set to the new LiquidationHandler

`DATA_STORE_ADDRESS`, `EVENT_EMITTER_ADDRESS`, and `REFERRAL_STORAGE_ADDRESS`
should already point at House A and shouldn't change.

If your PR added new tokens or markets, update
`keeper-service/src/config/tokens.ts` (`TOKEN_ADDRESSES` map and
`PYTH_LAZER_FEED_CONFIGS`) accordingly.

### Squid indexer / other consumers

If you redeployed `EventEmitter` (you shouldn't have — it's pinned), the
indexer needs a re-sync from the new EventEmitter's deploy block. For
normal Layer 2/3 redeploys, the indexer keeps working.

---

## Layer 1 changes (special case)

If your PR touches `DataStore.sol`, `RoleStore.sol`, `MarketFactory.sol`,
`MarketToken.sol`, or any file in MarketToken's compile graph
(`Bank.sol`, `RoleModule.sol`, `Keys.sol`, `Errors.sol`,
`TokenUtils.sol`), **do not run `hardhat deploy --network baseSepolia` as
your release plan.**

These changes will cause MarketToken's compiled bytecode to drift. The
existing deploy-script protection (`deployAndConfigureMarkets.ts` skips
already-existing markets via `getOnchainMarkets`) keeps a normal deploy
from breaking things *today* — but the latent risk is that any fresh
deploy from a clean checkout would derive different MarketToken addresses
and orphan all LP funds.

For these PRs:

1. Plan the migration before any deploy lands. See
   [ARCHITECTURE.md → When you must touch Layer 1](./ARCHITECTURE.md#when-you-must-touch-layer-1).
2. Coordinate with the protocol lead and at least one other contract
   reviewer.
3. If you're truly only adding a logic change that doesn't need a Layer 1
   migration, factor the change into a separate file outside MarketToken's
   compile graph (e.g., a new utility library). The Layer 1 source then
   stays untouched.

---

## Mainnet deploys

Same process, with three extra rules:

1. **Dry-run the deploy on a fork first.** Spin up a Base mainnet fork
   (`npx hardhat node --fork https://...`), point your config at it, and
   run the deploy end-to-end. Confirm output looks identical to the
   testnet deploy's output.
2. **Have a second person on the call.** Mainnet deploys are not a solo
   activity. Two engineers: one driving the deploy, one watching the
   block explorer for each tx.
3. **Snapshot the deployer wallet's roles before the deploy.** If anything
   goes wrong mid-deploy, you need to know exactly which roles the wallet
   had so you can verify they're still intact afterward.

There's no mainnet deployment as of this doc's writing. When there is,
this section gets expanded with the canonical mainnet Layer 1 addresses.

---

## Rollback / recovery

The deploy framework writes artifacts atomically per contract. A failure
mid-deploy doesn't leave you in an unrecoverable state:

- **Contract deployed but role grant failed.** Re-run the deploy. The
  contract is in its artifact, hardhat-deploy will skip the deploy step
  and re-execute `grantRoleIfNotGranted` which is idempotent.
- **Wrong Layer 2/3 contract deployed.** Just don't sync the frontend SDK
  to point at it. The old contract keeps working until the SDK switches.
  Then redeploy with the correct source and sync the SDK to the new address.
- **Layer 1 accidentally redeployed.** This is the catastrophic case. The
  contract repo's artifact now points at the wrong DataStore/RoleStore.
  Recovery: revert the artifact JSON change in git, re-point the artifact
  at the canonical House A address, and never commit/push the bad artifact.
  If the redeploy actually landed on-chain (TX succeeded), the canonical
  Layer 1 has *not* moved — there's just a new orphaned DataStore at a new
  address that nothing reads from. No funds lost, but the workspace needs
  cleaning up before the next deploy.

---

## Canonical addresses on Base Sepolia (House A)

These are the sacred addresses. Anything you deploy must end up wired to
these. Anything that points elsewhere is a bug.

| Contract | Address |
|---|---|
| DataStore | `0x0cA7D71845cb485B7593bBdCbcac93d82d52d053` |
| RoleStore | `0xa5fCcD8Eba314B08cF6f637C390f78693Eb1289C` |
| MarketFactory | `0x60418A0f55d73b086530C9CFDA3cd7bc47a68a66` |
| EventEmitter | `0x68001935Ec7C2e3980f99435db3CabC89dea602B` |

When in doubt, check `deployments/baseSepolia/DataStore.json` on this
branch — it should match the table above. If it doesn't, stop and ask
before you deploy.

---

## Open follow-ups

These should land before the next non-trivial deploy:

1. Add `bytecodeHash: "none"` to `hardhat.config.ts` under
   `solidity.settings.metadata`. Strips the metadata CBOR so future
   incidental source edits don't drift MarketToken's bytecode.
2. Add `skipIfAlreadyDeployed: true` to `deploy/deployAndConfigureAssetTokens.ts`
   so synthetic tokens (Euro/GBP/Gold/Silver/JPY/WTI) can never accidentally
   redeploy at new addresses.
3. Add a CI bytecode-drift check that compares the locally compiled
   bytecode for `DataStore`, `RoleStore`, `MarketFactory`, `MarketToken`
   against the on-chain bytecode at the canonical addresses. Fail the
   build on mismatch.

Last updated: May 2026.
