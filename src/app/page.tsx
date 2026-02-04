"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useNexus } from "@/components/nexus/NexusProvider";
import UnifiedBalance from "@/components/deposit/UnifiedBalance";
import VaultSelector from "@/components/deposit/VaultSelector";
import DepositWidget from "@/components/deposit/DepositWidget";
import { VAULT_CONFIGS, type VaultConfig } from "@/lib/constants";
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

            {selectedVault && <DepositWidget vault={selectedVault} />}
          </div>
        </div>
      )}
    </div>
  );
}
