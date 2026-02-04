"use client";

import React, { useState, useCallback, useEffect, useReducer } from "react";
import { useAccount } from "wagmi";
import { encodeFunctionData, parseUnits, type Address, type Abi } from "viem";
import {
  SUPPORTED_CHAINS,
  TOKEN_CONTRACT_ADDRESSES,
  TOKEN_METADATA,
  CHAIN_METADATA,
  type SUPPORTED_CHAINS_IDS,
  type SUPPORTED_TOKENS,
  type ExecuteParams,
  type BridgeAndExecuteParams,
} from "@avail-project/nexus-core";
import { useNexus } from "@/components/nexus/NexusProvider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { cn, formatUSD } from "@/lib/utils";
import {
  AAVE_POOL_ABI,
  MORPHO_VAULT_ABI,
  type VaultConfig,
  DESTINATION_CHAIN_ID,
} from "@/lib/constants";
import {
  ArrowRight,
  Check,
  Loader2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

type DepositStatus =
  | "idle"
  | "simulating"
  | "confirming"
  | "executing"
  | "success"
  | "error";

interface DepositWidgetProps {
  vault: VaultConfig;
  className?: string;
}

const DepositWidget = ({ vault, className }: DepositWidgetProps) => {
  const { address } = useAccount();
  const {
    nexusSDK,
    bridgableBalance,
    intent,
    allowance,
    fetchBridgableBalance,
    getFiatValue,
    loading,
  } = useNexus();

  const [amount, setAmount] = useState<string>("");
  const [status, setStatus] = useState<DepositStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [intentUrl, setIntentUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Get total available balance for USDC across all chains
  const availableBalance = bridgableBalance?.find(
    (b) => b.symbol === "USDC"
  );

  const totalBalance = availableBalance?.breakdown?.reduce(
    (sum: number, chain: any) => sum + parseFloat(chain.balance),
    0
  ) || 0;

  const totalBalanceFiat = availableBalance?.breakdown?.reduce(
    (sum: number, chain: any) => sum + (chain.balanceInFiat || 0),
    0
  ) || 0;

  // Build execute params for the vault deposit
  const buildExecuteParams = useCallback(
    (
      token: "USDC" | "USDT",
      amountStr: string,
      chainId: SUPPORTED_CHAINS_IDS,
      userAddress: Address
    ): Omit<ExecuteParams, "toChainId"> => {
      const decimals = TOKEN_METADATA[token].decimals;
      const amountWei = parseUnits(amountStr, decimals);
      const tokenAddress = (TOKEN_CONTRACT_ADDRESSES as any)[token][chainId] as Address;

      if (vault.protocol === "aave") {
        const data = encodeFunctionData({
          abi: AAVE_POOL_ABI,
          functionName: "supply",
          args: [tokenAddress, amountWei, userAddress, 0],
        });

        return {
          to: vault.address,
          data,
          tokenApproval: {
            token,
            amount: amountWei,
            spender: vault.address,
          },
        };
      } else {
        // Morpho vault
        const data = encodeFunctionData({
          abi: MORPHO_VAULT_ABI,
          functionName: "deposit",
          args: [amountWei, userAddress],
        });

        return {
          to: vault.address,
          data,
          tokenApproval: {
            token,
            amount: amountWei,
            spender: vault.address,
          },
        };
      }
    },
    [vault]
  );

  const handleDeposit = async () => {
    if (!nexusSDK || !address || !amount || parseFloat(amount) <= 0) return;

    setStatus("simulating");
    setError(null);
    setProgress(10);

    try {
      const token: SUPPORTED_TOKENS = "USDC";
      const chainId = DESTINATION_CHAIN_ID;

      // Get all source chains with balance
      const sourceChains = availableBalance?.breakdown
        ?.filter((chain: any) => parseFloat(chain.balance) > 0)
        .map((chain: any) => chain.chain.id) || [];

      if (sourceChains.length === 0) {
        throw new Error("No source chains with balance available");
      }

      const amountBigInt = nexusSDK.convertTokenReadableAmountToBigInt(
        amount,
        token,
        chainId
      );

      const executeParams = buildExecuteParams(token, amount, chainId, address);

      const params: BridgeAndExecuteParams = {
        token,
        amount: amountBigInt,
        toChainId: chainId,
        sourceChains,
        execute: executeParams,
      };

      setProgress(30);
      setStatus("confirming");

      // Execute the bridge and deposit
      const result = await nexusSDK.bridgeAndExecute(params);

      setProgress(100);
      setStatus("success");
      setIntentUrl(result.bridgeExplorerUrl || null);
      setTxHash(result.executeExplorerUrl || null);

      // Refresh balances
      await fetchBridgableBalance();
    } catch (err) {
      console.error("Deposit error:", err);
      setError(err instanceof Error ? err.message : "Deposit failed");
      setStatus("error");

      // Reset intent if there was an error
      if (intent.current) {
        intent.current.deny();
        intent.current = null;
      }
    }
  };

  const handleMax = () => {
    setAmount(totalBalance.toFixed(6));
  };

  const reset = () => {
    setAmount("");
    setStatus("idle");
    setError(null);
    setTxHash(null);
    setIntentUrl(null);
    setProgress(0);
  };

  const isProcessing = ["simulating", "confirming", "executing"].includes(
    status
  );

  const amountNum = parseFloat(amount) || 0;
  const amountUsd = getFiatValue(amountNum, "USDC");

  return (
    <Card className={cn("w-full max-w-md", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>Deposit to {vault.name}</span>
        </CardTitle>
        <CardDescription>
          Bridge from any chain and deposit USDC to {vault.protocol} on Base
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {status === "success" ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Deposit Successful!</h3>
              <p className="text-sm text-muted-foreground">
                {amount} USDC deposited to {vault.name}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {intentUrl && (
                <a
                  href={intentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 text-sm text-primary hover:underline"
                >
                  View Intent <ExternalLink className="w-4 h-4" />
                </a>
              )}
              {txHash && (
                <a
                  href={txHash}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 text-sm text-primary hover:underline"
                >
                  View Transaction <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
            <Button onClick={reset} className="w-full">
              Make Another Deposit
            </Button>
          </div>
        ) : (
          <>
            {/* Amount Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="amount">Amount</Label>
                <div className="text-sm text-muted-foreground">
                  Balance: {totalBalance.toFixed(4)} USDC
                  <button
                    onClick={handleMax}
                    className="ml-2 text-primary hover:underline"
                    disabled={isProcessing}
                  >
                    Max
                  </button>
                </div>
              </div>
              <div className="relative">
                <Input
                  id="amount"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isProcessing}
                  className="pr-16 text-lg"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                  USDC
                </span>
              </div>
              {amountNum > 0 && (
                <p className="text-sm text-muted-foreground">
                  ≈ {formatUSD(amountUsd)}
                </p>
              )}
            </div>

            <Separator />

            {/* Source chains breakdown */}
            {availableBalance && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Available on:</p>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {availableBalance.breakdown
                    ?.filter((chain: any) => parseFloat(chain.balance) > 0)
                    .map((chain: any) => (
                      <div
                        key={chain.chain.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2">
                          {chain.chain.logo && (
                            <img
                              src={chain.chain.logo}
                              alt={chain.chain.name}
                              className="w-5 h-5 rounded-full"
                            />
                          )}
                          <span>{chain.chain.name}</span>
                        </div>
                        <span>{parseFloat(chain.balance).toFixed(4)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Destination */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <div className="flex items-center gap-2">
                <img
                  src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png"
                  alt="Base"
                  className="w-6 h-6 rounded-full"
                />
                <span className="font-medium">Base</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-background flex items-center justify-center">
                  <img
                    src={vault.logo}
                    alt={vault.protocol}
                    className="w-4 h-4"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <span className="font-medium">{vault.name}</span>
              </div>
            </div>

            {/* Progress */}
            {isProcessing && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-center text-muted-foreground">
                  {status === "simulating" && "Calculating route..."}
                  {status === "confirming" && "Confirm in wallet..."}
                  {status === "executing" && "Executing deposit..."}
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Actions */}
            <Button
              onClick={handleDeposit}
              disabled={
                isProcessing ||
                !amount ||
                amountNum <= 0 ||
                amountNum > totalBalance ||
                !nexusSDK
              }
              className="w-full"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Deposit"
              )}
            </Button>

            {status === "error" && (
              <Button variant="outline" onClick={reset} className="w-full">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DepositWidget;
