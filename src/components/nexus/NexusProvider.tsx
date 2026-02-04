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

  // Initialize SDK only on client side with dynamic import
  useEffect(() => {
    const initSDK = async () => {
      if (!sdkRef.current && typeof window !== "undefined") {
        try {
          const { NexusSDK } = await import("@avail-project/nexus-core");
          sdkRef.current = new NexusSDK({
            ...stableConfig,
          });
          setSdkReady(true);
        } catch (error) {
          console.error("Failed to initialize Nexus SDK:", error);
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
      allowance.current = data;
    });

    sdk.setOnIntentHook((data: OnIntentHookData) => {
      intent.current = data;
    });

    sdk.setOnSwapIntentHook((data: OnSwapIntentHookData) => {
      swapIntent.current = data;
    });
  };

  const handleInit = async (provider: EthereumProvider) => {
    // Wait for SDK to be ready if it's still initializing
    let sdk = sdkRef.current;
    const maxWait = 20;
    let waited = 0;
    while (!sdk && waited < maxWait) {
      // wait 100ms
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100));
      waited += 1;
      sdk = sdkRef.current;
    }

    if (!sdk) {
      throw new Error("Nexus SDK failed to initialize in time");
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
