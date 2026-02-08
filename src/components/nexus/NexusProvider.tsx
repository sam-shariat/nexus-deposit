"use client";

import {
  createContext,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAccountEffect } from "wagmi";
import { pushDebugLog } from "@/components/deposit/components/debug-log-panel";

// Types - these are safe to import statically as they don't cause SSR issues
type NexusSDK = any;
type EthereumProvider = any;
type NexusNetwork = "mainnet" | "testnet";
type OnAllowanceHookData = any;
type OnIntentHookData = any;
type OnSwapIntentHookData = any;
type SupportedChainsAndTokensResult = any;
type SupportedChainsResult = any;
type UserAsset = any;

interface NexusContextType {
  nexusSDK: NexusSDK | null;
  bridgableBalance: UserAsset[] | null;
  swapBalance: UserAsset[] | null;
  intent: RefObject<OnIntentHookData | null>;
  allowance: RefObject<OnAllowanceHookData | null>;
  swapIntent: RefObject<OnSwapIntentHookData | null>;
  exchangeRate: Record<string, number> | null;
  supportedChainsAndTokens: SupportedChainsAndTokensResult | null;
  swapSupportedChainsAndTokens: SupportedChainsResult | null;
  network?: NexusNetwork;
  loading: boolean;
  handleInit: (provider: EthereumProvider) => Promise<void>;
  fetchBridgableBalance: () => Promise<void>;
  fetchSwapBalance: () => Promise<void>;
  getFiatValue: (amount: number, token: string) => number;
  initializeNexus: (provider: EthereumProvider) => Promise<void>;
  deinitializeNexus: () => Promise<void>;
  attachEventHooks: () => void;
}

const NexusContext = createContext<NexusContextType | undefined>(undefined);

type NexusProviderProps = {
  children: React.ReactNode;
  config?: {
    network?: NexusNetwork;
    debug?: boolean;
  };
};

const defaultConfig: Required<NexusProviderProps["config"]> = {
  network: "mainnet",
  debug: false,
};

const NexusProvider = ({
  children,
  config = defaultConfig,
}: NexusProviderProps) => {
  const stableConfig = useMemo(
    () => ({ ...defaultConfig, ...config }),
    [config]
  );

  const sdkRef = useRef<NexusSDK | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  // Resolvers for code that needs to wait for SDK construction
  const sdkReadyPromiseRef = useRef<Promise<void> | null>(null);
  const sdkReadyResolveRef = useRef<(() => void) | null>(null);

  // Initialize SDK only on client side with dynamic import
  useEffect(() => {
    const initSDK = async () => {
      if (!sdkRef.current && typeof window !== "undefined") {
        // Create a promise other code can await
        if (!sdkReadyPromiseRef.current) {
          sdkReadyPromiseRef.current = new Promise<void>((resolve) => {
            sdkReadyResolveRef.current = resolve;
          });
        }
        try {
          pushDebugLog("info", "NexusProvider", "Dynamically importing @avail-project/nexus-core...");
          const { NexusSDK } = await import("@avail-project/nexus-core");
          sdkRef.current = new NexusSDK({
            ...stableConfig,
          });
          setSdkReady(true);
          pushDebugLog("success", "NexusProvider", "NexusSDK constructed successfully", { network: stableConfig.network });
          // Signal that SDK is constructed
          sdkReadyResolveRef.current?.();
        } catch (error) {
          console.error("Failed to initialize Nexus SDK:", error);
          pushDebugLog("error", "NexusProvider", "Failed to construct NexusSDK", {
            message: (error as Error)?.message,
            stack: (error as Error)?.stack?.split("\n").slice(0, 5).join("\n"),
          });
          // Resolve anyway so waiters don't hang forever
          sdkReadyResolveRef.current?.();
        }
      }
    };
    initSDK();
  }, [stableConfig]);

  const sdk = sdkRef.current;

  const [nexusSDK, setNexusSDK] = useState<NexusSDK | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const supportedChainsAndTokens =
    useRef<SupportedChainsAndTokensResult | null>(null);
  const swapSupportedChainsAndTokens = useRef<SupportedChainsResult | null>(
    null
  );
  const [bridgableBalance, setBridgableBalance] = useState<UserAsset[] | null>(
    null
  );
  const [swapBalance, setSwapBalance] = useState<UserAsset[] | null>(null);
  const exchangeRate = useRef<Record<string, number> | null>(null);

  const intent = useRef<OnIntentHookData | null>(null);
  const allowance = useRef<OnAllowanceHookData | null>(null);
  const swapIntent = useRef<OnSwapIntentHookData | null>(null);

  const setupNexus = useCallback(async () => {
    const sdk = sdkRef.current;
    if (!sdk) return;
    console.debug("Nexus setupNexus: sdk present, fetching supported chains and balances");

    const list = sdk.utils.getSupportedChains(
      config?.network === "testnet" ? 0 : undefined
    );
    supportedChainsAndTokens.current = list ?? null;
    
    // Log supported chains for debugging
    console.debug("Nexus supported chains:", list?.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })));
    
    // Check if our destination chain is supported
    const destinationChainId = 42161; // Arbitrum
    const isArbitrumSupported = sdk.utils.isSupportedChain(destinationChainId as any);
    console.debug(`Arbitrum (${destinationChainId}) supported:`, isArbitrumSupported);
    
    const swapList = sdk.utils.getSwapSupportedChainsAndTokens();
    swapSupportedChainsAndTokens.current = swapList ?? null;
    const [bridgeAbleBalanceResult, swapBalanceResult, rates] = await Promise.allSettled([
      sdk.getBalancesForBridge(),
      sdk.getBalancesForSwap(),
      sdk.utils.getCoinbaseRates(),
    ]);

    if (bridgeAbleBalanceResult.status === "fulfilled") {
      setBridgableBalance(bridgeAbleBalanceResult.value);
    }

    if (swapBalanceResult.status === "fulfilled") {
      setSwapBalance(swapBalanceResult.value);
    }

    if (rates?.status === "fulfilled") {
      const usdPerUnit: Record<string, number> = {};
      for (const [symbol, value] of Object.entries(rates.value)) {
        const unitsPerUsd = Number.parseFloat(String(value));
        if (Number.isFinite(unitsPerUsd) && unitsPerUsd > 0) {
          usdPerUnit[symbol.toUpperCase()] = 1 / unitsPerUsd;
        }
      }
      exchangeRate.current = usdPerUnit;
    }
  }, [config?.network]);

  const initializeNexus = async (provider: EthereumProvider) => {
    const sdk = sdkRef.current;
    if (!sdk) return;
    console.debug("initializeNexus: initializing SDK with provider", !!provider);
    setLoading(true);
    try {
      if (sdk.isInitialized()) throw new Error("Nexus is already initialized");
      await sdk.initialize(provider);
      setNexusSDK(sdk);
    } catch (error) {
      console.error("Error initializing Nexus:", error);
    } finally {
      setLoading(false);
    }
  };

  const deinitializeNexus = async () => {
    try {
      if (!nexusSDK) throw new Error("Nexus is not initialized");
      await nexusSDK?.deinit();
      setNexusSDK(null);
      supportedChainsAndTokens.current = null;
      swapSupportedChainsAndTokens.current = null;
      setBridgableBalance(null);
      setSwapBalance(null);
      exchangeRate.current = null;
      intent.current = null;
      swapIntent.current = null;
      allowance.current = null;
      setLoading(false);
    } catch (error) {
      console.error("Error deinitializing Nexus:", error);
    }
  };

  const attachEventHooks = () => {
    const sdk = sdkRef.current;
    if (!sdk) return;

    sdk.setOnAllowanceHook((data: OnAllowanceHookData) => {
      console.debug("Nexus onAllowanceHook triggered:", data);
      allowance.current = data;
      // Auto-allow with 'max' for all sources to proceed with the flow
      // data.sources is an array, we need to provide 'max' for each
      try {
        const allowValues = data.sources?.map(() => 'max') || ['max'];
        console.debug("Auto-allowing allowances with:", allowValues);
        data.allow(allowValues);
      } catch (err) {
        console.error("Error auto-allowing allowance:", err);
      }
    });

    sdk.setOnIntentHook((data: OnIntentHookData) => {
      console.debug("Nexus onIntentHook triggered:", data);
      intent.current = data;
      // Auto-allow the intent to proceed with the flow
      try {
        console.debug("Auto-allowing intent");
        data.allow();
      } catch (err) {
        console.error("Error auto-allowing intent:", err);
      }
    });

    sdk.setOnSwapIntentHook((data: OnSwapIntentHookData) => {
      console.debug("Nexus onSwapIntentHook triggered:", data);
      swapIntent.current = data;
      // Auto-allow the swap intent to proceed with the flow
      try {
        console.debug("Auto-allowing swap intent");
        data.allow();
      } catch (err) {
        console.error("Error auto-allowing swap intent:", err);
      }
    });
  };

  const handleInit = async (provider: EthereumProvider) => {
    pushDebugLog("info", "NexusProvider", "handleInit called", { hasProvider: !!provider });

    // Wait for the SDK dynamic import to complete (no arbitrary polling)
    if (sdkReadyPromiseRef.current) {
      // Race against a 15-second timeout so callers don't hang forever
      const timeout = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Nexus SDK failed to initialize in time")), 15_000)
      );
      await Promise.race([sdkReadyPromiseRef.current, timeout]);
    }

    const sdk = sdkRef.current;
    if (!sdk) {
      throw new Error("Nexus SDK failed to initialize — dynamic import may have failed");
    }

    if (sdk.isInitialized() || loading) {
      return;
    }
    if (!provider || typeof provider.request !== "function") {
      throw new Error("Invalid EIP-1193 provider");
    }
    await initializeNexus(provider);
    await setupNexus();
    attachEventHooks();
  };

  const fetchBridgableBalance = async () => {
    const sdk = sdkRef.current;
    if (!sdk) return;
    try {
      const updatedBalance = await sdk.getBalancesForBridge();
      setBridgableBalance(updatedBalance);
    } catch (error) {
      console.error("Error fetching bridgable balance:", error);
    }
  };

  const fetchSwapBalance = async () => {
    const sdk = sdkRef.current;
    if (!sdk) return;
    try {
      const updatedBalance = await sdk.getBalancesForSwap();
      setSwapBalance(updatedBalance);
    } catch (error) {
      console.error("Error fetching swap balance:", error);
    }
  };

  function getFiatValue(amount: number, token: string) {
    if (!exchangeRate.current) return 0;
    const rate = exchangeRate.current[token.toUpperCase()] ?? 0;
    return amount * rate;
  }

  useAccountEffect({
    onDisconnect() {
      deinitializeNexus();
    },
  });

  const value = useMemo(
    () => ({
      nexusSDK,
      initializeNexus,
      deinitializeNexus,
      attachEventHooks,
      intent,
      allowance,
      handleInit,
      supportedChainsAndTokens: supportedChainsAndTokens.current,
      swapSupportedChainsAndTokens: swapSupportedChainsAndTokens.current,
      bridgableBalance,
      swapBalance: swapBalance,
      network: config?.network,
      loading,
      fetchBridgableBalance,
      fetchSwapBalance,
      swapIntent,
      exchangeRate: exchangeRate.current,
      getFiatValue,
    }),
    [
      nexusSDK,
      swapBalance,
      bridgableBalance,
      config,
      loading,
    ]
  );

  return (
    <NexusContext.Provider value={value}>{children}</NexusContext.Provider>
  );
};

export function useNexus() {
  const context = useContext(NexusContext);
  if (context === undefined) {
    throw new Error("useNexus must be used within a NexusProvider");
  }
  return context;
}

export default NexusProvider;
