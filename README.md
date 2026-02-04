# Nexus Cross-Chain Deposit dApp

A Next.js dApp that enables cross-chain deposits to Aave V3 and Morpho vaults on Base, powered by [Avail Nexus](https://docs.availproject.org/nexus).

## Features

- 🌐 **Cross-Chain Deposits**: Aggregate assets from 10+ chains and deposit to Base in a single transaction
- 💼 **RainbowKit Integration**: Seamless wallet connection with RainbowKit
- 📊 **Unified Balance**: View your total balance across all supported chains
- 🏦 **Multiple Vaults**: Choose between Aave V3 and Morpho vaults
- ⚡ **Powered by Nexus**: Uses Avail Nexus SDK for cross-chain bridging and execution

## Supported Chains

- Ethereum Mainnet
- Arbitrum One
- Optimism
- Polygon
- Base
- BNB Smart Chain
- Avalanche
- Linea
- Scroll
- zkSync Era

## Getting Started

### Prerequisites

- Node.js 18+ 
- pnpm, npm, or yarn

### Installation

1. Clone the repository:
```bash
git clone <your-repo>
cd nexus-deposit-dapp
```

2. Install dependencies:
```bash
pnpm install
# or
npm install
```

3. Copy the environment file and configure:
```bash
cp .env.example .env.local
```

4. Update `.env.local` with your values:
```env
# WalletConnect Project ID (required - get from https://cloud.walletconnect.com)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id

# Aave V3 Pool on Base (default is mainnet pool)
NEXT_PUBLIC_AAVE_POOL_ADDRESS=0xA238Dd80C259a72e81d7e4664a9801593F98d1c5

# Morpho Vault on Base (add your target vault address)
NEXT_PUBLIC_MORPHO_VAULT_ADDRESS=0x...

# USDC on Base
NEXT_PUBLIC_USDC_BASE_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

5. Run the development server:
```bash
pnpm dev
# or
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Architecture

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Main page component
│   └── globals.css        # Global styles
├── components/
│   ├── deposit/           # Deposit-related components
│   │   ├── DepositWidget.tsx    # Main deposit form
│   │   ├── UnifiedBalance.tsx   # Cross-chain balance display
│   │   └── VaultSelector.tsx    # Vault selection UI
│   ├── nexus/             # Nexus SDK integration
│   │   ├── NexusProvider.tsx    # Nexus context provider
│   │   └── InitNexusOnConnect.tsx
│   ├── ui/                # Shadcn UI components
│   ├── Header.tsx         # App header
│   └── Providers.tsx      # App-wide providers
└── lib/
    ├── constants.ts       # Vault configs, ABIs
    ├── utils.ts           # Utility functions
    └── wagmi.ts           # Wagmi/RainbowKit config
```

## How It Works

1. **Connect Wallet**: User connects their wallet using RainbowKit
2. **Initialize Nexus**: The Nexus SDK is initialized automatically on wallet connection
3. **View Balance**: The unified balance shows assets across all supported chains
4. **Select Vault**: User selects a destination vault (Aave or Morpho)
5. **Enter Amount**: User enters the amount to deposit
6. **Execute**: Nexus SDK handles:
   - Aggregating assets from source chains
   - Bridging to Base
   - Executing the deposit transaction

## Customization

### Adding a New Vault

Edit `src/lib/constants.ts`:

```typescript
export const VAULT_CONFIGS: VaultConfig[] = [
  // ... existing vaults
  {
    name: "Your Vault Name",
    protocol: "your-protocol",
    address: "0x...",
    depositMethod: "deposit",
    apy: "~X.X%",
    description: "Your vault description",
    logo: "/your-logo.svg",
  },
];
```

### Changing Destination Chain

Update `DESTINATION_CHAIN_ID` in `src/lib/constants.ts`:

```typescript
export const DESTINATION_CHAIN_ID = SUPPORTED_CHAINS.OPTIMISM; // or another chain
```

## Resources

- [Avail Nexus Documentation](https://docs.availproject.org/nexus)
- [Nexus Elements](https://elements.nexus.availproject.org/)
- [RainbowKit](https://rainbowkit.com/)
- [wagmi](https://wagmi.sh/)
- [viem](https://viem.sh/)

## License

MIT
