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

// Aave V3 Pool on Base
export const AAVE_POOL_ADDRESS =
  (process.env.NEXT_PUBLIC_AAVE_POOL_ADDRESS as Address) ||
  "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";

// Morpho Vault on Base (placeholder - update with your vault)
export const MORPHO_VAULT_ADDRESS =
  (process.env.NEXT_PUBLIC_MORPHO_VAULT_ADDRESS as Address) || "0x";

// USDC on Base
export const USDC_BASE_ADDRESS =
  (process.env.NEXT_PUBLIC_USDC_BASE_ADDRESS as Address) ||
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Destination chain for deposits (Base chain ID = 8453)
export const DESTINATION_CHAIN_ID = 8453;

// Available vaults for deposit
export const VAULT_CONFIGS: VaultConfig[] = [
  {
    name: "Aave V3 USDC",
    protocol: "aave",
    address: AAVE_POOL_ADDRESS,
    depositMethod: "supply",
    apy: "~4.5%",
    description: "Supply USDC to Aave V3 on Base and earn interest",
    logo: "/aave.svg",
  },
  {
    name: "Morpho USDC Vault",
    protocol: "morpho",
    address: MORPHO_VAULT_ADDRESS,
    depositMethod: "deposit",
    apy: "~5.2%",
    description: "Deposit USDC to Morpho vault on Base for optimized yields",
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
