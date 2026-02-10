"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useNexus } from "@/components/nexus/NexusProvider";
import UnifiedBalance from "@/components/deposit/UnifiedBalance";
import VaultSelector from "@/components/deposit/VaultSelector";
import NexusDeposit from "@/components/deposit/nexus-deposit";
import { DebugLogPanel } from "@/components/deposit/components/debug-log-panel";
import { AaveBalance } from "@/components/deposit/components/aave-balance";
import ViewHistory from "@/components/view-history/view-history";
import {
  type ExecuteParams,
} from "@avail-project/nexus-core";
import { encodeFunctionData, type Address } from "viem";
import {
  VAULT_CONFIGS,
  AAVE_POOL_ABI,
  MORPHO_VAULT_ABI,
  DESTINATION_CHAIN_ID,
  type VaultConfig,
} from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowRight, Layers, Shield, Zap } from "lucide-react";

export default function Home() {
  const { isConnected } = useAccount();
  const { nexusSDK, loading } = useNexus();
  const [selectedVault, setSelectedVault] = useState<VaultConfig | null>(
    VAULT_CONFIGS[0]
  );

  // Build the executeDeposit function for the selected vault
  // This receives any token symbol + address from the widget (could be ETH, USDC, USDT, etc.)
  // The Nexus widget handles swapping to USDC on destination chain automatically
  const executeDeposit = useCallback(
    (
      tokenSymbol: string,
      tokenAddress: `0x${string}`,
      amount: bigint,
      chainId: number,
      user: `0x${string}`
    ): Omit<ExecuteParams, "toChainId"> => {
      const vault = selectedVault || VAULT_CONFIGS[0];

      if (vault.protocol === "aave") {
        // Aave supply: the widget provides the correct tokenAddress on the destination chain
        const data = encodeFunctionData({
          abi: AAVE_POOL_ABI,
          functionName: "supply",
          args: [tokenAddress, amount, user, 0],
        });

        return {
          to: vault.address,
          data,
          tokenApproval: {
            token: tokenAddress, // Must be the contract address, not symbol
            amount,
            spender: vault.address,
          },
        };
      } else {
        // Morpho vault deposit
        const data = encodeFunctionData({
          abi: MORPHO_VAULT_ABI,
          functionName: "deposit",
          args: [amount, user],
        });

        return {
          to: vault.address,
          data,
          tokenApproval: {
            token: tokenAddress, // Must be the contract address, not symbol
            amount,
            spender: vault.address,
          },
        };
      }
    },
    [selectedVault]
  );

  // Build destination config for the NexusDeposit widget
  // Use hardcoded values to avoid SSR issues with SDK constants
  const destinationConfig = {
    chainId: DESTINATION_CHAIN_ID as any,
    tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as `0x${string}`, // USDC on Arbitrum
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    tokenLogo: "https://coin-images.coingecko.com/coins/images/6319/large/usdc.png",
    label: `Deposit to ${selectedVault?.name || "Aave V3"}`,
    gasTokenSymbol: "ETH",
    estimatedTime: "≈ 30s",
    explorerUrl: "https://arbiscan.io",
    depositTargetLogo: selectedVault?.logo,
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Hero Section */}
      <section className="text-center space-y-4 py-8">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Cross-Chain DeFi Deposits
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Deposit to Aave or Morpho on Base from any supported chain. Powered by{" "}
          <a
            href="https://docs.availproject.org/nexus"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Avail Nexus
          </a>
        </p>
      </section>

      {!isConnected ? (
        // Not connected state
        <div className="flex flex-col items-center justify-center py-16 space-y-8">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle>Connect Your Wallet</CardTitle>
              <CardDescription>
                Connect your wallet to view your cross-chain balance and make
                deposits
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <ConnectButton />
            </CardContent>
          </Card>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-6 w-full max-w-4xl">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center space-y-2">
                  <div className="p-3 rounded-full bg-primary/10">
                    <Layers className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold">Multi-Chain</h3>
                  <p className="text-sm text-muted-foreground">
                    Aggregate assets from 10+ chains
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center space-y-2">
                  <div className="p-3 rounded-full bg-primary/10">
                    <Zap className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold">One-Click</h3>
                  <p className="text-sm text-muted-foreground">
                    Bridge and deposit in a single transaction
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center space-y-2">
                  <div className="p-3 rounded-full bg-primary/10">
                    <Shield className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold">Secure</h3>
                  <p className="text-sm text-muted-foreground">
                    Powered by Avail Nexus infrastructure
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : loading ? (
        // Loading state
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
          <div className="lg:col-span-2">
            <Skeleton className="h-96 w-full rounded-lg" />
          </div>
        </div>
      ) : (
        // Connected state
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left sidebar - Balance */}
          <div className="lg:col-span-1 space-y-6">
            <UnifiedBalance />

            {/* Transaction History */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  Transaction History
                  <ViewHistory className="" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ViewHistory viewAsModal={false} className="w-full" />
              </CardContent>
            </Card>

            {/* Supported Chains Info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Supported Chains</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    {
                      name: "Ethereum",
                      logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
                    },
                    {
                      name: "Arbitrum",
                      logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png",
                    },
                    {
                      name: "Optimism",
                      logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png",
                    },
                    {
                      name: "Polygon",
                      logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png",
                    },
                    {
                      name: "Base",
                      logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png",
                    },
                    {
                      name: "BSC",
                      logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png",
                    },
                    {
                      name: "Avalanche",
                      logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png",
                    },
                    {
                      name: "Linea",
                      logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/linea/info/logo.png",
                    },
                    {
                      name: "Scroll",
                      logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/scroll/info/logo.png",
                    },
                    {
                      name: "zkSync",
                      logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/zksync/info/logo.png",
                    },
                  ].map((chain) => (
                    <div
                      key={chain.name}
                      className="flex items-center justify-center"
                      title={chain.name}
                    >
                      <img
                        src={chain.logo}
                        alt={chain.name}
                        className="w-8 h-8 rounded-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "https://via.placeholder.com/32";
                        }}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main content - Deposit */}
          <div className="lg:col-span-2 space-y-6">
            <VaultSelector
              selectedVault={selectedVault}
              onSelect={setSelectedVault}
            />

            {selectedVault && (
              <NexusDeposit
                embed={true}
                heading={`Deposit to ${selectedVault.name}`}
                destination={destinationConfig}
                executeDeposit={executeDeposit}
                onSuccess={() => {
                  console.log("Deposit successful!");
                }}
                onError={(error) => {
                  console.error("Deposit failed:", error);
                }}
              />
            )}
          </div>

          {/* Aave USDC Balance — below deposit, above debug log */}
          <div className="lg:col-span-2 lg:col-start-2">
            <AaveBalance />
          </div>

          {/* Debug Log Panel - full width below the grid */}
          <div className="lg:col-span-3 mt-6">
            <DebugLogPanel />
          </div>
        </div>
      )}
    </div>
  );
}
