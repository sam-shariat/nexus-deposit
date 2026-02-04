"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useNexus } from "./NexusProvider";

// Use any type for EthereumProvider since we dynamically import the SDK
type EthereumProvider = any;

export function InitNexusOnConnect() {
  const { status, connector } = useAccount();
  const { handleInit } = useNexus();

  useEffect(() => {
    if (status === "connected") {
      connector?.getProvider().then((p) => handleInit(p as EthereumProvider));
    }
  }, [status, connector, handleInit]);

  return null;
}
