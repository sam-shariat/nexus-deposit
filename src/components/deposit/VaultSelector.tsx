"use client";

import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VAULT_CONFIGS, type VaultConfig } from "@/lib/constants";
import { Check, ExternalLink, TrendingUp } from "lucide-react";

interface VaultSelectorProps {
  selectedVault: VaultConfig | null;
  onSelect: (vault: VaultConfig) => void;
  className?: string;
}

const VaultSelector = ({
  selectedVault,
  onSelect,
  className,
}: VaultSelectorProps) => {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Select Destination</h3>
        <span className="text-sm text-muted-foreground">on Base</span>
      </div>

      <div className="grid gap-3">
        {VAULT_CONFIGS.map((vault) => {
          const isSelected = selectedVault?.address === vault.address;
          const isDisabled = vault.address === "0x";

          return (
            <Card
              key={vault.address}
              className={cn(
                "cursor-pointer transition-all hover:border-primary/50",
                isSelected && "border-primary bg-primary/5",
                isDisabled && "opacity-50 cursor-not-allowed"
              )}
              onClick={() => !isDisabled && onSelect(vault)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <img
                        src={vault.logo}
                        alt={vault.protocol}
                        className="w-6 h-6"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                    <div>
                      <p className="font-medium">{vault.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {vault.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {vault.apy && (
                      <div className="flex items-center gap-1 text-green-600">
                        <TrendingUp className="w-4 h-4" />
                        <span className="text-sm font-medium">{vault.apy}</span>
                      </div>
                    )}
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-4 h-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                </div>
                {isDisabled && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Configure MORPHO_VAULT_ADDRESS in .env
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default VaultSelector;
