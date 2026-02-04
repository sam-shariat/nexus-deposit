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

interface LogEntry {
  timestamp: Date;
  type: "info" | "event" | "error" | "success" | "simulation" | "debug";
  message: string;
  data?: unknown;
}

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
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // Helper to add log entries
  const addLog = useCallback((type: LogEntry["type"], message: string, data?: unknown) => {
    setLogs((prev) => [...prev, { timestamp: new Date(), type, message, data }]);
  }, []);

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
    setLogs([]); // Clear previous logs
    setShowLogs(true); // Auto-show logs when starting

    try {
      const token: SUPPORTED_TOKENS = "USDC";
      const chainId = DESTINATION_CHAIN_ID;

      addLog("info", "Starting deposit process", { token, chainId, amount });

      // Validate destination chain is supported
      const isDestinationSupported = nexusSDK.utils.isSupportedChain(chainId as any);
      if (!isDestinationSupported) {
        throw new Error(`Destination chain ${chainId} is not supported by Nexus SDK`);
      }
      addLog("success", `Destination chain ${chainId} is supported`);

      // Get all source chains with balance
      const sourceChains = availableBalance?.breakdown
        ?.filter((chain: any) => parseFloat(chain.balance) > 0)
        .map((chain: any) => chain.chain.id) || [];

      if (sourceChains.length === 0) {
        throw new Error("No source chains with balance available");
      }

      addLog("info", `Found ${sourceChains.length} source chain(s) with balance`, { sourceChains });

      const amountBigInt = nexusSDK.convertTokenReadableAmountToBigInt(
        amount,
        token,
        chainId
      );

      addLog("debug", "Converted amount to BigInt", { amountBigInt: amountBigInt.toString() });

      const executeParams = buildExecuteParams(token, amount, chainId, address);
      addLog("debug", "Built execute params", { 
        to: executeParams.to,
        tokenApproval: {
          token: executeParams.tokenApproval?.token,
          amount: executeParams.tokenApproval?.amount?.toString(),
          spender: executeParams.tokenApproval?.spender,
        }
      });

      const params: BridgeAndExecuteParams = {
        token,
        amount: amountBigInt,
        toChainId: chainId,
        sourceChains,
        execute: executeParams,
      };

      addLog("info", "Prepared bridgeAndExecute params", {
        token: params.token,
        amount: params.amount.toString(),
        toChainId: params.toChainId,
        sourceChains: params.sourceChains,
      });

      // Run simulation first to catch issues early
      addLog("info", "Running simulation...");
      setProgress(15);
      
      try {
        const simulation = await nexusSDK.simulateBridgeAndExecute(params);
        addLog("simulation", "Simulation completed successfully", {
          bridgeSimulation: simulation.bridgeSimulation ? {
            estimatedFees: simulation.bridgeSimulation.estimatedFees,
            estimatedTime: simulation.bridgeSimulation.estimatedTime,
          } : null,
          executeSimulation: simulation.executeSimulation ? {
            gasUsed: simulation.executeSimulation.gasUsed?.toString(),
            gasPrice: simulation.executeSimulation.gasPrice?.toString(),
            gasFee: simulation.executeSimulation.gasFee?.toString(),
          } : null,
        });
        setProgress(25);
      } catch (simError) {
        addLog("error", "Simulation failed (proceeding anyway)", { 
          error: simError instanceof Error ? simError.message : String(simError) 
        });
      }

      setProgress(30);
      setStatus("confirming");
      addLog("info", "Waiting for wallet confirmation...");

      // Execute the bridge and deposit
      try {
        const result = await nexusSDK.bridgeAndExecute(params, {
          onEvent: (event: any) => {
            const eventName = event?.name || "UNKNOWN";
            const eventArgs = event?.args;
            
            // Log the event
            addLog("event", `Event: ${eventName}`, {
              type: eventArgs?.type,
              typeID: eventArgs?.typeID,
              data: eventArgs?.data,
            });

            // Update progress by event type
            try {
              if (eventName === "STEPS_LIST") {
                setProgress(35);
                addLog("info", "Received steps list", { steps: eventArgs });
              }
              if (eventName === "STEP_COMPLETE") {
                setProgress((p) => Math.min(95, p + 10));
                addLog("success", `Step completed: ${eventArgs?.type || eventArgs?.typeID || "unknown"}`);
              }
              if (eventName === "SWAP_STEP_COMPLETE") {
                addLog("success", `Swap step completed: ${eventArgs?.type || eventArgs?.typeID || "unknown"}`);
              }
              if (eventName === "ERROR") {
                addLog("error", "Error event received", eventArgs);
                setError(eventArgs?.message || "Nexus event error");
                setStatus("error");
              }
            } catch (e) {
              addLog("error", "Error handling nexus event", { error: String(e) });
            }
          },
        });

        addLog("success", "bridgeAndExecute completed!", {
          bridgeSkipped: result.bridgeSkipped,
          executeTransactionHash: result.executeTransactionHash,
          executeExplorerUrl: result.executeExplorerUrl,
          bridgeExplorerUrl: result.bridgeExplorerUrl,
          approvalTransactionHash: result.approvalTransactionHash,
          toChainId: result.toChainId,
        });

        setProgress(100);
        setStatus("success");
        setIntentUrl(result.bridgeExplorerUrl || null);
        setTxHash(result.executeExplorerUrl || null);
      } catch (err) {
        addLog("error", "bridgeAndExecute failed", { 
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        throw err;
      }

      // Refresh balances
      addLog("info", "Refreshing balances...");
      await fetchBridgableBalance();
      addLog("success", "Balances refreshed");
    } catch (err) {
      console.error("Deposit error:", err);
      addLog("error", "Deposit failed", { 
        error: err instanceof Error ? err.message : String(err) 
      });
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
    setLogs([]);
    setShowLogs(false);
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
          Bridge from any chain and deposit USDC to {vault.protocol} on Arbitrum
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
                  src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png"
                  alt="Arbitrum"
                  className="w-6 h-6 rounded-full"
                />
                <span className="font-medium">Arbitrum</span>
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

            {/* Detailed Logs View */}
            {(logs.length > 0 || showLogs) && (
              <div className="space-y-2 mt-4">
                <button
                  onClick={() => setShowLogs(!showLogs)}
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className={cn(
                    "transform transition-transform",
                    showLogs ? "rotate-90" : ""
                  )}>
                    ▶
                  </span>
                  Detailed Logs ({logs.length})
                </button>
                
                {showLogs && (
                  <div className="rounded-lg border bg-muted/30 overflow-hidden">
                    <div className="max-h-64 overflow-y-auto p-2 space-y-1 font-mono text-xs">
                      {logs.length === 0 ? (
                        <p className="text-muted-foreground p-2">No logs yet. Start a deposit to see detailed steps.</p>
                      ) : (
                        logs.map((log, i) => (
                          <div
                            key={i}
                            className={cn(
                              "p-2 rounded border-l-2",
                              log.type === "info" && "bg-blue-500/5 border-blue-500",
                              log.type === "event" && "bg-purple-500/5 border-purple-500",
                              log.type === "error" && "bg-red-500/5 border-red-500",
                              log.type === "success" && "bg-green-500/5 border-green-500",
                              log.type === "simulation" && "bg-yellow-500/5 border-yellow-500",
                              log.type === "debug" && "bg-gray-500/5 border-gray-500"
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-muted-foreground shrink-0">
                                {log.timestamp.toLocaleTimeString()}
                              </span>
                              <span className={cn(
                                "font-semibold uppercase shrink-0",
                                log.type === "info" && "text-blue-600 dark:text-blue-400",
                                log.type === "event" && "text-purple-600 dark:text-purple-400",
                                log.type === "error" && "text-red-600 dark:text-red-400",
                                log.type === "success" && "text-green-600 dark:text-green-400",
                                log.type === "simulation" && "text-yellow-600 dark:text-yellow-400",
                                log.type === "debug" && "text-gray-600 dark:text-gray-400"
                              )}>
                                [{log.type}]
                              </span>
                              <span className="break-all">{log.message}</span>
                            </div>
                            {log.data !== undefined && (
                              <pre className="mt-1 text-[10px] text-muted-foreground overflow-x-auto bg-background/50 p-1 rounded">
                                {(() => {
                                  try {
                                    return JSON.stringify(log.data, (_, v) => 
                                      typeof v === 'bigint' ? v.toString() : v, 2
                                    );
                                  } catch {
                                    return String(log.data);
                                  }
                                })()}
                              </pre>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                    {logs.length > 0 && (
                      <div className="border-t p-2 flex justify-end">
                        <button
                          onClick={() => setLogs([])}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Clear logs
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DepositWidget;
