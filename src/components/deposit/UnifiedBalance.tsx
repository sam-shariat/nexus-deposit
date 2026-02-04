"use client";

import React, { useMemo } from "react";
import { useNexus } from "@/components/nexus/NexusProvider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface UnifiedBalanceProps {
  className?: string;
}

const UnifiedBalance = ({ className }: UnifiedBalanceProps) => {
  const { bridgableBalance, nexusSDK, loading } = useNexus();

  const totalFiat = useMemo(() => {
    if (!bridgableBalance) return "0.00";

    return bridgableBalance
      .reduce((acc, asset) => {
        const assetTotal = asset.breakdown?.reduce(
          (sum: number, chain: any) => sum + (chain.balanceInFiat || 0),
          0
        );
        return acc + (assetTotal || 0);
      }, 0)
      .toFixed(2);
  }, [bridgableBalance]);

  if (!nexusSDK) {
    return (
      <div
        className={cn(
          "rounded-lg border bg-card p-6 text-card-foreground",
          className
        )}
      >
        <p className="text-sm text-muted-foreground text-center">
          Connect wallet to see your unified balance
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!bridgableBalance || bridgableBalance.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border bg-card p-6 text-card-foreground",
          className
        )}
      >
        <p className="text-sm text-muted-foreground text-center">
          No cross-chain balance available
        </p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-muted-foreground">
          Cross-Chain Balance
        </span>
        <span className="text-xl font-semibold">${totalFiat}</span>
      </div>

      <Accordion type="multiple" className="w-full">
        {bridgableBalance.map((asset) => {
          const positiveBreakdown =
            asset.breakdown?.filter(
              (chain: any) => parseFloat(chain.balance) > 0
            ) || [];

          if (positiveBreakdown.length === 0) return null;

          const assetTotal = positiveBreakdown
            .reduce((sum: number, chain: any) => sum + (chain.balanceInFiat || 0), 0)
            .toFixed(2);

          return (
            <AccordionItem key={asset.symbol} value={asset.symbol}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  {asset.icon && (
                    <img
                      src={asset.icon}
                      alt={asset.symbol}
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{asset.symbol}</span>
                    <span className="text-xs text-muted-foreground">
                      {positiveBreakdown.length} chain
                      {positiveBreakdown.length > 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <span className="font-semibold mr-2">${assetTotal}</span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pl-11">
                  {positiveBreakdown.map((chain: any, index: number) => (
                    <React.Fragment key={chain.chain?.id}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {chain.chain?.logo && (
                            <img
                              src={chain.chain.logo}
                              alt={chain.chain.name}
                              className="w-5 h-5 rounded-full"
                            />
                          )}
                          <span className="text-sm">{chain.chain?.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {parseFloat(chain.balance).toFixed(4)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ${chain.balanceInFiat?.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      {index < positiveBreakdown.length - 1 && (
                        <Separator className="my-2" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
};

export default UnifiedBalance;
