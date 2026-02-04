import { type Address } from "viem";

// Protocol types
export type Protocol = "aave" | "morpho";

// Vault configuration
export interface VaultConfig {
  name: string;
  protocol: Protocol;
  address: Address;
  depositMethod: string;
  apy?: string;
  description: string;
  logo: string;
}

// Aave V3 Pool on Arbitrum mainnet
export const AAVE_POOL_ADDRESS =
  (process.env.NEXT_PUBLIC_AAVE_POOL_ADDRESS as Address) ||
  "0x794a61358D6845594F94dc1DB02A252b5b4814aD";

// Morpho Vault on Arbitrum mainnet (placeholder - update with your vault)
export const MORPHO_VAULT_ADDRESS =
  (process.env.NEXT_PUBLIC_MORPHO_VAULT_ADDRESS as Address) || "0x";

// USDC on Arbitrum mainnet
export const USDC_ARB_ADDRESS =
  (process.env.NEXT_PUBLIC_USDC_ARB_ADDRESS as Address) ||
  "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

// Destination chain for deposits (Arbitrum mainnet chain ID = 42161)
export const DESTINATION_CHAIN_ID = 42161;

// Available vaults for deposit
export const VAULT_CONFIGS: VaultConfig[] = [
  {
    name: "Aave V3 USDC",
    protocol: "aave",
    address: AAVE_POOL_ADDRESS,
    depositMethod: "supply",
    apy: "~4.5%",
    description: "Bridge from any chain and deposit USDC to Aave V3 on Arbitrum",
    logo: "/aave.svg",
  },
  {
    name: "Morpho USDC Vault",
    protocol: "morpho",
    address: MORPHO_VAULT_ADDRESS,
    depositMethod: "deposit",
    apy: "~5.2%",
    description: "Bridge from any chain and deposit USDC to Morpho vault on Arbitrum",
    logo: "/morpho.svg",
  },
];

// ABIs for deposit functions
export const AAVE_POOL_ABI = [
  {
    inputs: [
      { internalType: "address", name: "asset", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "address", name: "onBehalfOf", type: "address" },
      { internalType: "uint16", name: "referralCode", type: "uint16" },
    ],
    name: "supply",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const MORPHO_VAULT_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "assets", type: "uint256" },
      { internalType: "address", name: "receiver", type: "address" },
    ],
    name: "deposit",
    outputs: [{ internalType: "uint256", name: "shares", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
