# Avail Nexus SDK — Complete Documentation

> **Package**: `@avail-project/nexus-core`
> **Type**: Headless TypeScript SDK for cross-chain operations
> **Current version in this project**: `1.0.0-beta.64`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Initialization Flow](#2-initialization-flow)
3. [Token Selection & Routing — How the SDK Picks Tokens](#3-token-selection--routing)
4. [Controlling Which Tokens to Use](#4-controlling-which-tokens-to-use)
5. [Core Methods Reference](#5-core-methods-reference)
6. [Event System](#6-event-system)
7. [Hooks System (Intent / Allowance / Swap Intent)](#7-hooks-system)
8. [Intent System & Lifecycle](#8-intent-system--lifecycle)
9. [Fee Structure](#9-fee-structure)
10. [Supported Chains & Tokens](#10-supported-chains--tokens)
11. [Configuration Options](#11-configuration-options)
12. [Smart Optimizations](#12-smart-optimizations)
13. [Key Exports & Types](#13-key-exports--types)
14. [Error Handling](#14-error-handling)
15. [How This Project Uses the SDK](#15-how-this-project-uses-the-sdk)

---

## 1. Architecture Overview

The Nexus SDK is a **headless TypeScript library** that abstracts away cross-chain complexity. Instead of the developer manually selecting bridges, DEX aggregators, and routing paths, the SDK takes a declarative "intent" — _"I want X tokens on chain Y"_ — and handles the rest.

### Class Hierarchy

```
NexusSDK extends CA (Chain Abstraction base class)
```

### Internal Components

| Component | Location (SDK Source) | Purpose |
|-----------|----------------------|---------|
| **CA base class** | `ca-base/ca.ts` | Wallet state, hooks, protected methods for all operations |
| **BridgeHandler** | `ca-base/requestHandlers/bridge.ts` | Bridge intent lifecycle (create, deposit, wait for fill) |
| **BridgeAndExecuteQuery** | `ca-base/query/bridgeAndExecute.ts` | Bridge + execute + direct execute logic |
| **SwapAndExecuteQuery** | `ca-base/query/swapAndExecute.ts` | Swap + execute orchestration |
| **Route Determination** | `ca-base/swap/route.ts` | Exact-in and exact-out routing algorithms |
| **SourceSwapsHandler** | `ca-base/swap/ob.ts` | Source-side swap execution |
| **DestinationSwapHandler** | `ca-base/swap/ob.ts` | Destination-side swap execution |
| **RFF Creator** | `ca-base/swap/rff.ts` | Creates Request-For-Funds for swaps |
| **VSC Client** | Backend client | Balance queries, RFF publishing |
| **Cosmos Query Client** | Backend client | Fees, oracle prices, intent status |

### High-Level Flow

```
User Wallet → NexusSDK.initialize(provider)
            → SDK creates ephemeral wallet + Cosmos signing client
            → SDK authenticates via SIWE (Sign-In With Ethereum)
            → Ready for operations
```

---

## 2. Initialization Flow

```typescript
// 1. Construct (browser-only — uses indexedDB internally)
const sdk = new NexusSDK({ network: 'mainnet' });

// 2. Initialize with wallet provider (EIP-1193)
await sdk.initialize(provider);
```

### What `initialize()` does internally:

1. **Sets EVM provider** — `_setEVMProvider(provider)` connects the user's wallet
2. **Creates Cosmos wallet** — `DirectSecp256k1Wallet` for Cosmos-side signing  
3. **Creates signing client** — for submitting intents to the Cosmos chain
4. **SIWE authentication** — Signs a message to authenticate the user
5. **Creates ephemeral wallet** — a temporary `PrivateKeyAccount` used for swap operations (permits, batched txs)
6. **Starts refund loop** — periodically checks for expired intents and triggers refunds
7. **Initializes analytics** — PostHog telemetry (can be disabled)

### Post-Initialization Setup

After `initialize()`, your app should:

```typescript
// Fetch supported chains and tokens
const supportedChains = sdk.utils.getSupportedChains();
const swapChains = sdk.utils.getSwapSupportedChainsAndTokens();

// Fetch user balances and exchange rates
const [balances, rates] = await Promise.allSettled([
  sdk.getBalancesForBridge(),
  sdk.utils.getCoinbaseRates(),
]);

// Attach event hooks (optional — SDK auto-approves if not set)
sdk.setOnIntentHook(({ intent, allow, deny, refresh }) => { ... });
sdk.setOnSwapIntentHook(({ intent, allow, deny, refresh }) => { ... });
sdk.setOnAllowanceHook(({ sources, allow, deny }) => { ... });
```

---

## 3. Token Selection & Routing

### How Does the SDK Pick Which Tokens to Use?

This is the core "magic" of Nexus. When you call `swapAndExecute()` or `bridgeAndExecute()`, the SDK:

1. **Fetches all user balances** across every supported chain
2. **Determines a route** through the Currency of Transfer (COT)
3. **Auto-selects source tokens** based on a priority algorithm
4. **Executes the swaps and bridge** in the optimal order

### Currency of Transfer (COT)

All cross-chain operations route through **USDC** as the intermediary currency:

```
Source Tokens → Swap to USDC (on source chains) → Bridge USDC cross-chain → Swap USDC to destination token
```

This means: if you have ETH on Optimism and want USDC on Arbitrum, the SDK will:
1. Swap ETH → USDC on Optimism (via LiFi or Bebop)
2. Bridge USDC from Optimism → Arbitrum (via Nexus intent system)
3. Deliver USDC on Arbitrum (no final swap needed since destination is USDC)

### Route Determination Algorithm

Located in `swap/route.ts`, the SDK supports two modes:

#### Exact-Out (default for `swapAndExecute`)
_"I want exactly X tokens on the destination chain"_

1. Fetch FeeStore, user balances (filtered to stables + natives), oracle prices
2. **Work backwards** from desired output → calculate how much COT (USDC) is needed
3. Calculate fees: collection fee + fulfilment fee + buffer (5% destination, 2% source)
4. **Auto-select sources** via `autoSelectSourcesV2()` — picks optimal tokens from user's portfolio
5. Determine if bridge is needed (any source not on destination chain?)

#### Exact-In
_"I want to spend exactly X tokens from this source"_

1. Fetch all balances (not just stables)
2. Validate specified `from` sources exist with sufficient balance
3. Determine if source swaps needed (if sources aren't already USDC)
4. Use `liquidateInputHoldings()` to swap non-USDC tokens to USDC
5. Determine bridge and destination swap as needed

### Source Priority Algorithm (`sortSourcesByPriority`)

When auto-selecting which tokens to use, the SDK **ranks them by priority** (lower number = preferred):

| Priority | What It Matches | Why |
|----------|----------------|-----|
| **1** | Same token on destination chain | No swap or bridge needed |
| **2** | USDC/USDT on destination chain (non-Ethereum) | Only swap needed, no bridge |
| **3** | Native gas token on destination chain (non-Ethereum) | Swap needed, no bridge |
| **4** | Any other token on destination chain (non-Ethereum) | Swap needed, no bridge |
| **5** | Same token on other non-Ethereum chains | Bridge needed, no swap |
| **6** | USDC/USDT on other non-Ethereum chains | Bridge needed, minimal swap |
| **7** | Any other token on non-Ethereum chains | Swap + bridge needed |
| **8** | Same token on Ethereum | Bridge needed, high gas |

**Key insight**: Ethereum sources are deprioritized because gas costs are significantly higher. The SDK prefers L2 sources.

### DEX Aggregators

The SDK currently uses two aggregators for swap quotes:

```typescript
const aggregators: Aggregator[] = [
  new LiFiAggregator(LIFI_API_KEY),
  new BebopAggregator(BEBOP_API_KEY),
];
```

The SDK queries both and selects the best quote.

### Route Result Structure

```typescript
type SwapRoute = {
  source: {
    swaps: QuoteResponse[];    // DEX quotes for source-side swaps
    creationTime: number;
  };
  bridge: BridgeInput | null;   // null if no bridge needed
  destination: {
    type: 'EXACT_IN' | 'EXACT_OUT';
    swap: DestinationSwap;      // DEX quote for destination swap
    dstEOAToEphTx: {            // Transfer to ephemeral wallet
      amount: bigint;
      contractAddress: Hex;
    } | null;
  };
  extras: {
    assetsUsed: {               // Which user assets were selected
      amount: bigint;
      chainID: number;
      contractAddress: Hex;
      decimals: number;
      symbol: string;
    }[];
    aggregators: Aggregator[];
    oraclePrices: OraclePriceResponse;
    balances: FlatBalance[];
  };
};
```

---

## 4. Controlling Which Tokens to Use

### For Bridge Operations (`bridge`, `bridgeAndTransfer`, `bridgeAndExecute`)

Use the **`sourceChains`** parameter to restrict which chains can be used as sources:

```typescript
await sdk.bridge({
  token: 'USDC',
  amount: 1_500_000n,        // 1.5 USDC (6 decimals)
  toChainId: 42161,           // Arbitrum
  sourceChains: [8453, 10],   // Only use Base and Optimism
});
```

If `sourceChains` is empty or omitted, the SDK uses **all chains** where the user has balance.

### For Swap Operations — `fromSources`

#### In `swapAndExecute` (Exact-Out):

```typescript
await sdk.swapAndExecute({
  toChainId: 42161,
  toTokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arb
  toAmount: parseUnits('100', 6),  // 100 USDC
  fromSources: [
    { chainId: 8453, tokenAddress: '0x...' },  // Only use this token on Base
    { chainId: 10, tokenAddress: '0x...' },     // And this token on Optimism
  ],
  execute: { ... },
}, { onEvent: (e) => { ... } });
```

When `fromSources` is provided:
- Only balances matching those chain+token pairs are considered
- The priority algorithm still applies within the filtered set
- If the filtered balances are insufficient, the operation will fail

When `fromSources` is **omitted** (undefined):
- The SDK auto-selects from **all** user balances across all chains
- Uses the priority algorithm described above

#### In `swapWithExactIn`:

```typescript
await sdk.swapWithExactIn({
  from: [
    { chainId: 8453, amount: parseUnits('50', 6), tokenAddress: '0x...' },
  ],
  toChainId: 42161,
  toTokenAddress: '0x...',
});
```

Here you **must** explicitly specify each source with exact amounts.

#### In `swapWithExactOut`:

```typescript
await sdk.swapWithExactOut({
  fromSources: [                          // Optional filter
    { tokenAddress: '0x...', chainId: 8453 },
  ],
  toChainId: 42161,
  toTokenAddress: '0x...',
  toAmount: 100_000_000n,
});
```

### Dynamic Source Changes via Hooks

You can also change sources **after** the initial route is computed, using the swap intent hook's `refresh()`:

```typescript
sdk.setOnSwapIntentHook(({ intent, allow, deny, refresh }) => {
  // Show user the computed intent...
  // User changes source selection...
  
  const updatedIntent = await refresh([
    { chainId: 10, tokenAddress: '0x...' }
  ]);
  
  // Show updated intent, then:
  allow();  // or deny()
});
```

### How This Project Controls Sources

In `use-deposit-widget.ts`, the widget builds `fromSources` from the user's asset selection UI:

```typescript
const fromSources: Array<{ tokenAddress: Hex; chainId: number }> = [];
assetSelection.selectedChainIds.forEach((key) => {
  const lastDashIndex = key.lastIndexOf("-");
  const tokenAddress = key.substring(0, lastDashIndex) as Hex;
  const chainId = parseInt(key.substring(lastDashIndex + 1), 10);
  fromSources.push({ tokenAddress, chainId });
});

const inputsWithSources = {
  ...inputs,
  fromSources: fromSources.length > 0 ? fromSources : undefined,
};
```

This means:
- If the user selects specific tokens/chains in the "Pay using" UI → those are passed as `fromSources`
- If no selection → `fromSources` is undefined → SDK auto-selects

---

## 5. Core Methods Reference

### SDK Lifecycle

| Method | Description | Returns |
|--------|-------------|---------|
| `new NexusSDK(config)` | Create SDK instance (browser-only) | `NexusSDK` |
| `sdk.initialize(provider)` | Connect wallet, authenticate | `Promise<void>` |
| `sdk.isInitialized()` | Check if SDK is ready | `boolean` |
| `sdk.deinit()` | Cleanup all state | `Promise<void>` |

### Bridge Operations

| Method | Description | Returns |
|--------|-------------|---------|
| `sdk.bridge(params, options?)` | Bridge tokens from one chain to another | `Promise<BridgeResult>` |
| `sdk.bridgeAndTransfer(params, options?)` | Bridge + send to a recipient address | `Promise<TransferResult>` |
| `sdk.bridgeAndExecute(params, options?)` | Bridge + execute a contract call on destination | `Promise<BridgeAndExecuteResult>` |
| `sdk.execute(params, options?)` | Execute contract on destination (no bridge) | `Promise<ExecuteResult>` |

### Swap Operations

| Method | Description | Returns |
|--------|-------------|---------|
| `sdk.swapWithExactIn(input, options?)` | Swap specifying exact input amounts | `Promise<SwapResult>` |
| `sdk.swapWithExactOut(input, options?)` | Swap specifying desired output amount | `Promise<SwapResult>` |
| `sdk.swapAndExecute(params, options?)` | Swap tokens + execute a contract call | `Promise<SwapAndExecuteResult>` |

### Balance & Data

| Method | Description | Returns |
|--------|-------------|---------|
| `sdk.getBalancesForBridge()` | Get user's unified bridgeable balances | `Promise<UserAsset[]>` |
| `sdk.getBalancesForSwap(onlyStables?)` | Get user's swappable balances | `Promise<UserAsset[]>` |
| `sdk.utils.getSupportedChains(filter?)` | Get supported chains & tokens | `SupportedChainsAndTokensResult` |
| `sdk.utils.getSwapSupportedChainsAndTokens()` | Get swap-supported chains | `SupportedChainsResult` |
| `sdk.utils.getCoinbaseRates()` | Get exchange rates (units per USD) | `Promise<Record<string, number>>` |
| `sdk.getMyIntents(page?)` | Get user's past intents/transactions | `Promise<RequestForFunds[]>` |

### Simulation (Dry-Run / Estimation)

| Method | Description | Returns |
|--------|-------------|---------|
| `sdk.simulateBridge(params)` | Estimate bridge cost/fees | `Promise<SimulationResult>` |
| `sdk.simulateBridgeAndTransfer(params)` | Estimate transfer cost | `Promise<SimulationResult>` |
| `sdk.simulateBridgeAndExecute(params)` | Estimate bridge+execute cost | `Promise<BridgeAndExecuteSimulationResult>` |
| `sdk.simulateExecute(params)` | Estimate execute cost | `Promise<ExecuteSimulation>` |
| `sdk.calculateMaxForBridge(params)` | Max amount that can be bridged | `Promise<BridgeMaxResult>` |

### Utility

| Method | Description |
|--------|-------------|
| `sdk.convertTokenReadableAmountToBigInt(value, symbol, chainId)` | Convert `"1.5"` → `bigint` |
| `sdk.refundIntent(intentID)` | Manually trigger a refund for an intent |

### Balance Return Type

```typescript
type UserAsset = {
  symbol: string;           // e.g. "USDC"
  balance: string;          // Total across all chains (human-readable)
  balanceInFiat: number;    // USD value
  decimals: number;
  icon?: string;
  breakdown: AssetBreakdown[];  // Per-chain balances
};

type AssetBreakdown = {
  chain: { id: number; name: string; logo: string };
  balance: string;
  balanceInFiat: number;
  contractAddress: `0x${string}`;
  decimals: number;
};
```

---

## 6. Event System

The SDK emits events during operations via the `onEvent` callback in options:

```typescript
sdk.swapAndExecute(params, {
  onEvent: (event) => {
    console.log(event.name, event.args);
  },
});
```

### Event Constants

```typescript
import { NEXUS_EVENTS } from '@avail-project/nexus-core';

NEXUS_EVENTS.STEP_COMPLETE       // Bridge/Execute step completed
NEXUS_EVENTS.SWAP_STEP_COMPLETE  // Swap step completed
NEXUS_EVENTS.STEPS_LIST          // Full list of expected steps (emitted at start)
```

### Bridge Steps (emitted as `STEP_COMPLETE`)

| Step | TypeID | Description |
|------|--------|-------------|
| `INTENT_ACCEPTED` | `IA` | User approved intent via hook |
| `INTENT_HASH_SIGNED` | `IHS` | User signed the intent hash |
| `INTENT_SUBMITTED` | `IS` | Intent submitted to chain (has `explorerURL`, `intentID`) |
| `ALLOWANCE_APPROVAL_REQUEST` | `AUA_{chainId}` | Requesting token approval on a chain |
| `ALLOWANCE_APPROVAL_MINED` | `AAM_{chainId}` | Approval transaction confirmed |
| `ALLOWANCE_COMPLETE` | `AAD` | All token approvals done |
| `INTENT_DEPOSIT_REQUEST` | `ID_{id}` | Depositing tokens to vault contract |
| `INTENT_DEPOSITS_CONFIRMED` | `UIDC` | All deposits confirmed |
| `INTENT_COLLECTION` | `IC_{id}` | Collecting deposits |
| `INTENT_COLLECTION_COMPLETE` | `ICC` | Collection done |
| `INTENT_FULFILLED` | `IF` | Solver fulfilled the intent on destination |
| `EXECUTE_APPROVAL_STEP` | `AP` | Token approval for execute call |
| `EXECUTE_TRANSACTION_SENT` | `TS` | Execute transaction sent |
| `EXECUTE_TRANSACTION_CONFIRMED` | `CN` | Execute transaction confirmed |

### Swap Steps (emitted as `SWAP_STEP_COMPLETE`)

| Step | TypeID | Description |
|------|--------|-------------|
| `SWAP_START` | `SWAP_START` | Swap operation begins |
| `DETERMINING_SWAP` | `DETERMINING_SWAP` | Computing route (has `completed` flag) |
| `CREATE_PERMIT_EOA_TO_EPHEMERAL` | `CREATE_PERMIT_EOA_TO_EPHEMERAL_{chainId}_{symbol}` | Creating permit to transfer to ephemeral wallet |
| `CREATE_PERMIT_FOR_SOURCE_SWAP` | `CREATE_PERMIT_FOR_SOURCE_SWAP_{chainId}_{symbol}` | Creating permit for source-side swap |
| `SOURCE_SWAP_BATCH_TX` | `SOURCE_SWAP_BATCH_TX` | Source swap batch transaction sent |
| `SOURCE_SWAP_HASH` | `SOURCE_SWAP_HASH_{chainId}` | Source swap hash (has `explorerURL`) |
| `BRIDGE_DEPOSIT` | `BRIDGE_DEPOSIT_{chainId}` | Bridge deposit on chain (has `hash`, `explorerURL`) |
| `RFF_ID` | `RFF_ID` | Request-For-Funds ID assigned |
| `DESTINATION_SWAP_BATCH_TX` | `DESTINATION_SWAP_BATCH_TX` | Destination swap batch sent |
| `DESTINATION_SWAP_HASH` | `DESTINATION_SWAP_HASH_{chainId}` | Destination swap hash |
| `SWAP_COMPLETE` | `SWAP_COMPLETE` | Swap fully completed |
| `SWAP_SKIPPED` | `SWAP_SKIPPED` | Swap skipped (user already has sufficient balance on dest chain) |

### Usage Pattern

```typescript
sdk.swapAndExecute(params, {
  onEvent: (event) => {
    switch (event.name) {
      case NEXUS_EVENTS.STEPS_LIST:
        // Initialize progress UI with event.args (step list)
        break;
      case NEXUS_EVENTS.SWAP_STEP_COMPLETE:
        const step = event.args;
        if (step.type === 'DETERMINING_SWAP' && step.completed) {
          // Route computed, show preview
        }
        if (step.type === 'SWAP_SKIPPED') {
          // No swap needed, go directly to execute
        }
        break;
    }
  },
});
```

---

## 7. Hooks System

Hooks let you intercept the SDK flow to show UI, get user approval, or modify parameters. **If a hook is not set, the SDK auto-approves and continues.**

### Default Behaviour (No Hooks Set)

```typescript
// SDK internals — what happens if you don't set hooks:
_hooks = {
  onAllowance: (data) => data.allow(data.sources.map(() => 'min')),
  onIntent: (data) => data.allow(),
  onSwapIntent: (data) => data.allow(),
};
```

### Intent Hook (Bridge Operations)

```typescript
sdk.setOnIntentHook(({ intent, allow, deny, refresh }) => {
  // intent: ReadableIntent — sources, destination, fees, token info
  // 
  // intent.sources[]:      { amount, chainID, chainLogo, chainName, contractAddress }
  // intent.destination:    { amount, chainID, chainLogo, chainName }
  // intent.fees:           { caGas, gasSupplied, protocol, solver, total }
  // intent.sourcesTotal:   string — total amount from all sources
  // intent.token:          { decimals, logo, name, symbol }
  
  // Options:
  allow();                              // Approve and continue
  deny();                               // Reject — throws USER_DENIED_INTENT
  const updated = await refresh([8453]); // Recalculate with different source chains
});
```

### Swap Intent Hook (Swap Operations)

```typescript
sdk.setOnSwapIntentHook(({ intent, allow, deny, refresh }) => {
  // intent: SwapIntent — sources, destination, gas info
  // Same API as intent hook
  
  allow();
  deny();
  const updated = await refresh([
    { chainId: 10, tokenAddress: '0x...' }  // Change source tokens
  ]);
});
```

### Allowance Hook (Both Bridge and Swap)

```typescript
sdk.setOnAllowanceHook(({ sources, allow, deny }) => {
  // sources: array of allowance requests
  // sources[i].chain:     { id, name, logo }
  // sources[i].token:     { symbol, decimals, contractAddress }
  // sources[i].allowance: { current, minimum, currentRaw, minimumRaw }
  
  // allow() takes an array matching sources.length
  // Each entry: 'min' | 'max' | bigint | string (custom amount)
  allow(sources.map(() => 'min'));   // Approve minimum needed
  allow(sources.map(() => 'max'));   // Approve unlimited
  allow(['1000000', '500000']);      // Custom amounts
  
  deny();  // Reject — throws USER_REJECTED_ALLOWANCE
});
```

> **CRITICAL**: If you set a hook, you **must** call `allow()` or `deny()`. Otherwise the operation will stall indefinitely. The hooks do NOT time out.

---

## 8. Intent System & Lifecycle

### What is an Intent?

An **intent** (internally called **RFF — Request For Funds**) is a declarative cross-chain transfer request. Instead of directly interacting with bridges, the user declares what they want and the Nexus solver network fulfills it.

### Intent Lifecycle

```
1. Build Intent          — Calculate sources, fees, amounts
2. Intent Hook           — Present to user for approval (allow/deny/refresh)
3. Allowance Check       — Check ERC20 allowances for source tokens
4. Allowance Hook        — If approvals needed, present to user
5. Set Allowances        — Sign permits or send approval transactions
6. Sign Intent Hash      — User signs the intent (EIP-712)
7. Create RFF on Cosmos  — Submit the intent to the Cosmos chain
8. Deposit to Vault      — Deposit source tokens to vault contracts on source chains
9. Wait for Fill         — Solver fulfills the intent on the destination chain
10. Verification         — Double-check the transaction
11. Intent Fulfilled     — Funds arrive, execute call runs if applicable
```

### Intent Structure

```typescript
type ReadableIntent = {
  sources: {
    amount: string;
    chainID: number;
    chainLogo: string;
    chainName: string;
    contractAddress: string;
  }[];
  allSources: { ... }[];           // All possible sources (before filtering)
  destination: {
    amount: string;
    chainID: number;
    chainLogo: string;
    chainName: string;
  };
  fees: {
    caGas: string;                  // Collection + fulfilment fees
    gasSupplied: string;            // Native gas delivered on destination
    protocol: string;               // Platform fee
    solver: string;                 // Solver fee
    total: string;                  // Total fees
  };
  sourcesTotal: string;             // Total deducted from sources
  token: {
    decimals: number;
    logo: string;
    name: string;
    symbol: string;
  };
};
```

### Intent Storage & Expiry

- Intents are stored in **localStorage** with a 10-minute expiry
- The SDK runs a periodic `refundExpiredIntents()` loop after initialization
- Expired intents are automatically refunded
- You can manually refund via `sdk.refundIntent(intentID)`

---

## 9. Fee Structure

Fees are fetched from the **Cosmos chain** via `getFeeStore()`. There are several fee components:

### Fee Components

| Fee | Description | How Calculated |
|-----|-------------|----------------|
| **Protocol Fee** | Platform cut | `borrowAmount × (feeBasisPoints / 10000)` |
| **Fulfilment Fee** | Fixed fee for destination chain operation | Looked up per `(destChainID, destTokenAddress)` |
| **Collection Fee** | Fixed fee per source chain | Looked up per `(srcChainID, srcTokenAddress)` |
| **Solver Fee** | Paid to the solver who fulfills the intent | `borrowAmount × (solverFeeBP / 10000)` per-route |
| **Gas Supplied** | Native gas delivered on destination chain | Converted from native gas to token equivalent via oracle |
| **CA Gas** | Sum of collection + fulfilment fees | `collectionFee + fulfilmentFee` |

### Fee Calculation — Bridge Operations

```
Total Required = requestedAmount
  + protocolFee         (% of requested amount)
  + gasInToken          (gas to supply on destination, denominated in token)
  + fulfilmentFee       (fixed, per destination chain)
  + Σ collectionFee     (fixed, per each source chain used)
  + Σ solverFee         (% of amount from each source)
```

### Fee Calculation — Swap Operations

For swaps, fees are embedded in the routing with **buffers**:
- **Destination swap**: 5% buffer added
- **Source swap**: 2% buffer added
- Solver fees are covered by the buffer in source swaps
- Collection + fulfilment fees are added to the required bridge amount

### Who Pays Fees?

The user pays all fees. They are deducted from the source tokens:
- The user sends `amount + fees` from their source chains
- The solver receives the fee portion as payment for fulfilling the intent
- The protocol fee goes to the Nexus protocol

---

## 10. Supported Chains & Tokens

### Mainnet Chains (12)

| Chain | Chain ID | Native Token |
|-------|----------|-------------|
| Ethereum | 1 | ETH |
| Base | 8453 | ETH |
| Arbitrum One | 42161 | ETH |
| Optimism | 10 | ETH |
| Polygon | 137 | MATIC |
| Avalanche C-Chain | 43114 | AVAX |
| Scroll | 534352 | ETH |
| Kaia | 8217 | KAIA |
| BNB Smart Chain | 56 | BNB |
| Hyper EVM | 999 | HYPE |
| Citrea | 4114 | cBTC |
| Monad | 143 | MON |

### Testnet Chains (7)

| Chain | Chain ID |
|-------|----------|
| Sepolia | 11155111 |
| Base Sepolia | 84532 |
| Arbitrum Sepolia | 421614 |
| Optimism Sepolia | 11155420 |
| Polygon Amoy | 80002 |
| Monad Testnet | 10143 |
| Citrea Testnet | 5115 |

### Supported Tokens

| Token | Decimals | Notes |
|-------|----------|-------|
| ETH | 18 | Native on ETH, Arb, Op, Base, Scroll |
| USDC | 6 | Available on all supported chains |
| USDT | 6 | Available on all supported chains |
| Other ERC-20s | varies | Swappable via DEX aggregators (LiFi, Bebop) |

> The SDK can swap **any token** that LiFi or Bebop support on a given chain, but only USDC/USDT/ETH are natively supported for bridge operations.

---

## 11. Configuration Options

### Constructor Options

```typescript
const sdk = new NexusSDK({
  // Required
  network: 'mainnet' | 'testnet',
  
  // Optional
  debug: boolean,                    // Enable verbose console logging
  siweChain: number,                 // Chain ID for SIWE authentication (default: auto)
  analytics: {
    enabled: boolean,                // Default: true
    posthogApiKey: string,           // Bring your own PostHog key
    posthogApiHost: string,
    privacy: {
      anonymizeWallets: boolean,     // Hash wallet addresses in telemetry
      anonymizeAmounts: boolean,     // Hash amounts in telemetry
    },
    appMetadata: {
      appName: string,               // Your app name
      appVersion: string,
      appUrl: string,
    },
  },
});
```

### Next.js / SSR Configuration

The SDK uses browser-only APIs (`indexedDB`, `window`, etc.). For Next.js:

```typescript
// next.config.ts — alias to false on server
webpack(config, { isServer }) {
  if (isServer) {
    config.resolve.alias['@avail-project/nexus-core'] = false;
  }
  return config;
}
```

```typescript
// NexusProvider.tsx — guard construction
if (typeof window !== 'undefined' && !sdkRef.current) {
  sdkRef.current = new NexusSDK({ network: 'mainnet' });
}
```

---

## 12. Smart Optimizations

The SDK includes several automatic optimizations:

### Bridge Skip

During `bridgeAndExecute` or `swapAndExecute`, the SDK checks if the user already has sufficient balance on the destination chain. If they do:
- **Full skip**: No bridge/swap needed → emits `SWAP_SKIPPED` event → proceeds directly to execute
- **Partial skip**: Only bridge/swap the shortfall amount → reduces fees and time

### Direct Transfer

For `bridgeAndTransfer`, if the user has enough tokens on the destination chain, it uses a **direct EVM transfer** instead of the intent system. This is cheaper and faster.

### Ephemeral Wallet

The SDK creates a temporary wallet for batching swap operations. This allows:
- Batched permit signatures (one signature for multiple token transfers)
- Gasless source-side swaps via permit2
- Atomic fail-safe: if any step fails, the ephemeral wallet can be drained back to the user

### Periodic Refund Loop

After initialization, the SDK periodically checks for expired intents (>10 minutes old) and automatically triggers refunds, returning tokens to the user.

---

## 13. Key Exports & Types

```typescript
import {
  // Core
  NexusSDK,
  NEXUS_EVENTS,
  
  // Chain data
  SUPPORTED_CHAINS,
  TOKEN_CONTRACT_ADDRESSES,
  TOKEN_METADATA,
  CHAIN_METADATA,
  
  // Step definitions
  SWAP_STEPS,
  BRIDGE_STEPS,
  
  // Errors
  NexusError,
  
  // Utilities
  formatTokenBalance,
  truncateAddress,
  parseUnits,
  
  // Types
  type NexusNetwork,
  type EthereumProvider,
  type BridgeParams,
  type ExecuteParams,
  type TransferParams,
  type ExactInSwapInput,
  type ExactOutSwapInput,
  type SwapAndExecuteParams,
  type SwapAndExecuteResult,
  type UserAsset,
  type UserAssetDatum,
  type ReadableIntent,
  type SwapResult,
  type BridgeResult,
  type OnIntentHookData,
  type OnSwapIntentHookData,
  type OnAllowanceHookData,
  type SwapStepType,
  type SupportedChainsAndTokensResult,
  type SupportedChainsResult,
  type SUPPORTED_CHAINS_IDS,
} from '@avail-project/nexus-core';
```

---

## 14. Error Handling

### Common Errors

| Error | Cause | Resolution |
|-------|-------|-----------|
| `USER_DENIED_INTENT` | User called `deny()` on intent hook | Expected user action |
| `USER_REJECTED_ALLOWANCE` | User called `deny()` on allowance hook | Expected user action |
| `INSUFFICIENT_BALANCE` | User doesn't have enough tokens | Show balance UI |
| `IntegerOutOfRangeError` | viem `hexToNumber` on large fee values | Patch viem (see below) |
| `Nexus is already initialized` | Calling `initialize()` twice | Check `isInitialized()` first |
| `Invalid EIP-1193 provider` | Bad wallet provider | Ensure wallet is connected |

### viem IntegerOutOfRangeError

The SDK internally uses viem's `hexToNumber` which throws for values > `Number.MAX_SAFE_INTEGER`. This happens with large fee values. The fix is to patch viem's `hexToNumber` function:

```javascript
// postinstall-patch-viem.mjs — patches all viem copies
// Replaces: if (size > 4) throw new IntegerOutOfRangeError(...)
// With: return Number(hexToBigInt(hex, opts))
```

This project includes a `postinstall` script that automatically applies this patch.

### NexusError

All SDK-thrown errors extend `NexusError`:

```typescript
try {
  await sdk.swapAndExecute(params);
} catch (error) {
  if (error instanceof NexusError) {
    // error.code — machine-readable error code
    // error.message — human-readable message
  }
}
```

---

## 15. How This Project Uses the SDK

### Architecture

```
page.tsx
├── NexusProvider        — wraps app, manages SDK lifecycle
├── NexusDeposit         — step-based deposit widget (embed mode)
│   └── useDepositWidget — main hook orchestrating the flow
│       ├── useDepositState     — reducer for widget state
│       ├── useAssetSelection   — token/chain selection state
│       └── useDepositComputed  — derived values (fees, totals)
├── UnifiedBalance       — shows cross-chain balances
├── VaultSelector        — Aave V3 / Morpho vault selection
├── ViewHistory          — past transaction history
└── DebugLogPanel        — real-time debug log viewer
```

### Flow

1. **User connects wallet** → `NexusProvider.handleInit()` → SDK initialized
2. **Balances load** → `getBalancesForSwap()` → shown in UnifiedBalance + asset selector
3. **User enters amount** → `handleAmountContinue()` builds `SwapAndExecuteParams`
4. **SDK computes route** → `DETERMINING_SWAP` event → shows confirmation screen
5. **User confirms** → `handleConfirmOrder()` → calls `activeIntent.allow()`
6. **SDK executes** → swaps, bridges, executes deposit on Aave/Morpho
7. **Complete** → `SwapAndExecuteResult` → shows success screen with explorer links

### Execute Params Builder

```typescript
// page.tsx — builds the Aave supply calldata
const executeDeposit = (tokenSymbol, tokenAddress, amount, chainId, user) => {
  const data = encodeFunctionData({
    abi: AAVE_POOL_ABI,
    functionName: 'supply',
    args: [tokenAddress, amount, user, 0],
  });
  
  return {
    to: AAVE_POOL_ADDRESS,
    data,
    tokenApproval: {
      token: tokenAddress,
      amount,
      spender: AAVE_POOL_ADDRESS,
    },
  };
};
```

### Destination Config

```typescript
const destinationConfig = {
  chainId: 42161,                    // Arbitrum
  tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  gasTokenSymbol: 'ETH',
  label: 'Deposit to Aave V3',
};
```

---

## Quick Reference: Common Patterns

### Deposit USDC to a DeFi Protocol on Another Chain

```typescript
await sdk.swapAndExecute({
  toChainId: 42161,
  toTokenAddress: USDC_ADDRESS,
  toAmount: parseUnits('100', 6),
  execute: {
    to: PROTOCOL_ADDRESS,
    data: encodeFunctionData({ ... }),
    tokenApproval: { token: USDC_ADDRESS, amount: parseUnits('100', 6), spender: PROTOCOL_ADDRESS },
    gas: 200_000n,
  },
});
```

### Bridge Only (No Execute)

```typescript
await sdk.bridge({
  token: 'USDC',
  amount: parseUnits('50', 6),
  toChainId: 42161,
});
```

### Get User's Total Balance Across All Chains

```typescript
const balances = await sdk.getBalancesForSwap();
const totalUSD = balances.reduce((sum, asset) => sum + asset.balanceInFiat, 0);
```

### Restrict Sources to Specific Chains

```typescript
await sdk.swapAndExecute({
  ...params,
  fromSources: [
    { chainId: 8453, tokenAddress: '0x...' },  // Only Base USDC
  ],
});
```
