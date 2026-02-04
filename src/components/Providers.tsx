"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { config } from "@/lib/wagmi";
import NexusProvider from "@/components/nexus/NexusProvider";
import { InitNexusOnConnect } from "@/components/nexus/InitNexusOnConnect";
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={{
            lightMode: lightTheme({
              accentColor: "#0066FF",
              accentColorForeground: "white",
              borderRadius: "medium",
            }),
            darkMode: darkTheme({
              accentColor: "#0066FF",
              accentColorForeground: "white",
              borderRadius: "medium",
            }),
          }}
        >
          <NexusProvider config={{ network: "mainnet", debug: true }}>
            <InitNexusOnConnect />
            {children}
          </NexusProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
