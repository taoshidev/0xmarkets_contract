# 0xMarkets Subsquid Indexer Design

## Overview

Subsquid-based indexer for the 0xMarkets protocol on Base Sepolia, providing data for:
- Trading UI (positions, orders, trade history)
- Analytics dashboard (TVL, volume, fees)
- Backend services (leaderboards, account stats)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Subsquid Indexer                        │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────┐    ┌──────────────┐    ┌────────────────┐   │
│  │ Subsquid  │───▶│  Processor   │───▶│   PostgreSQL   │   │
│  │ Archive   │    │ (TypeScript) │    │   Database     │   │
│  └───────────┘    └──────────────┘    └────────────────┘   │
│       │                  │                    │             │
│  Base Sepolia     Decode events,       ┌─────▼─────┐       │
│  archive          transform data       │  GraphQL  │       │
│                                        │   API     │       │
│                                        └───────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## Chain & Contracts

- **Chain**: Base Sepolia (Chain ID: 84532)
- **EventEmitter**: `0x1E4cBc2ea12B190D6222D568151b5e708e1477F8`

## Data Model

### Trading Entities

**TradeAction** - All order events (created, executed, cancelled, etc.)
- Links to account, market, order details
- Stores fees, PnL, prices, TWAP info

**Position** - Current and snapshot positions
- Tracks size, collateral, entry price
- Supports leaderboard snapshots

### Account Statistics

**AccountStats** - Lifetime account metrics
- Win/loss count, volume, realized PnL

**PeriodAccountStats** - Time-windowed stats for competitions
- Same metrics scoped to a time period

**AccountPnlSummaryStats** - Daily PnL buckets for charts

### Claims & Rebates

**ClaimAction** - Claimed funding fees and collateral
**ClaimableCollateral** - Pending rebates from price impact

### Market & Analytics

**MarketInfo** - Market parameters and pool state
**VolumeInfo** - Hourly/daily volume by market
**AprSnapshot** - Historical APR for LP returns
**FeesInfo** - Aggregated fee collection
**UserStats** - Unique user counts

## Event Decoding

The EventEmitter uses a generic event structure:

```solidity
event EventLog1(
    address msgSender,
    string eventName,
    string indexed eventNameHash,
    EventUtils.EventLogData eventData
);
```

Decoder extracts typed key-value pairs from `eventData`:
- addressItems, uintItems, intItems, boolItems
- bytes32Items, bytesItems, stringItems

Event routing maps `eventName` to specific handlers.

## Project Structure

```
0xmarkets-squid/
├── src/
│   ├── main.ts                 # Entry point
│   ├── processor.ts            # Processor config
│   ├── abi/EventEmitter.ts     # Generated ABI
│   ├── decoding/
│   │   ├── eventDecoder.ts     # Generic decoder
│   │   └── eventKeys.ts        # Event name hashes
│   ├── handlers/
│   │   ├── orders.ts
│   │   ├── positions.ts
│   │   ├── deposits.ts
│   │   ├── claims.ts
│   │   ├── markets.ts
│   │   └── stats.ts
│   └── utils/
├── schema.graphql
├── squid.yaml
└── docker-compose.yml
```

## Deployment

- **Development**: Local PostgreSQL via Docker
- **Production**: Subsquid Cloud (free tier sufficient for testnet)

## Frontend Integration

Update subgraph config to point to Subsquid endpoint:

```typescript
// src/config/subgraph.ts
export const SUBGRAPH_URLS = {
  [BASE_SEPOLIA]: {
    subsquid: 'https://squid.subsquid.io/0xmarkets-base-sepolia/graphql'
  }
}
```

## Estimated Storage

~5-10 MB/month for testnet activity. Subsquid Cloud free tier (10GB) covers months of use.
