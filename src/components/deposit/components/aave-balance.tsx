"use client";

import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import {
  AAVE_POOL_ADDRESS,
  USDC_ARB_ADDRESS,
  DESTINATION_CHAIN_ID,
} from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Aave V3 aUSDC on Arbitrum — this is the aToken the user receives
 * after supplying USDC to Aave V3. We read their balance of this token.
 *
 * Aave V3 aToken addresses are derived from the underlying asset + pool.
 * On Arbitrum mainnet, the aUSDC (aArbUSDCn) address is:
 */
const AUSDC_ARB_ADDRESS =
  "0x724dc807b04555b71ed48a6896b6F41593b8C637" as const;

const ATOKEN_ABI = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

interface AaveBalanceProps {
  className?: string;
}

export function AaveBalance({ className }: AaveBalanceProps) {
  const { address, isConnected } = useAccount();

  const {
    data: aUsdcBalance,
    isLoading,
    isError,
    refetch,
  } = useReadContract({
    address: AUSDC_ARB_ADDRESS,
    abi: ATOKEN_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: DESTINATION_CHAIN_ID,
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 30_000, // refresh every 30s
    },
  });

  if (!isConnected || !address) return null;

  const formatted =
    aUsdcBalance !== undefined
      ? parseFloat(formatUnits(aUsdcBalance, 6))
      : null;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          {/* Left: label + icon */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src="https://coin-images.coingecko.com/coins/images/6319/large/usdc.png"
                alt="USDC"
                className="w-8 h-8 rounded-full"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              {/* Aave badge */}
              <img
                src="/aave.svg"
                alt="Aave"
                className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white ring-1 ring-background"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
            <div>
              <p className="text-sm font-medium">Aave USDC Balance</p>
              <p className="text-xs text-muted-foreground">aUSDC on Arbitrum</p>
            </div>
          </div>

          {/* Right: balance */}
          <div className="text-right">
            {isLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : isError ? (
              <button
                onClick={() => refetch()}
                className="text-xs text-destructive hover:underline"
              >
                Error — retry
              </button>
            ) : (
              <>
                <p className="text-lg font-semibold tabular-nums">
                  {formatted !== null
                    ? formatted.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatted !== null
                    ? `$${formatted.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    : ""}
                </p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
