import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  mainnet,
  arbitrum,
  optimism,
  polygon,
  base,
  bsc,
  avalanche,
  linea,
  scroll,
  zksync,
} from "wagmi/chains";

// Chains supported by Nexus for cross-chain deposits
export const supportedChains = [
  mainnet,
  arbitrum,
  optimism,
  polygon,
  base,
  bsc,
  avalanche,
  linea,
  scroll,
  zksync,
] as const;

export const config = getDefaultConfig({
  appName: "Nexus Deposit dApp",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo",
  chains: supportedChains,
  ssr: true,
});
