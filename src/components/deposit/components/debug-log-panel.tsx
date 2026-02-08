"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";

export interface DebugLog {
  id: number;
  timestamp: Date;
  level: "info" | "warn" | "error" | "debug" | "event" | "success";
  source: string;
  message: string;
  data?: unknown;
}

// Global log store so any component can push logs
let _globalLogs: DebugLog[] = [];
let _globalListeners: Array<() => void> = [];
let _nextId = 1;

export function pushDebugLog(
  level: DebugLog["level"],
  source: string,
  message: string,
  data?: unknown,
) {
  const entry: DebugLog = {
    id: _nextId++,
    timestamp: new Date(),
    level,
    source,
    message,
    data,
  };
  _globalLogs = [..._globalLogs, entry];
  // Keep max 500 entries
  if (_globalLogs.length > 500) {
    _globalLogs = _globalLogs.slice(-500);
  }
  _globalListeners.forEach((fn) => fn());
}

export function clearDebugLogs() {
  _globalLogs = [];
  _globalListeners.forEach((fn) => fn());
}

function useDebugLogs() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    _globalListeners.push(listener);
    return () => {
      _globalListeners = _globalListeners.filter((l) => l !== listener);
    };
  }, []);
  return _globalLogs;
}

// Safe JSON stringify that handles bigint, circular refs, etc.
function safeStringify(value: unknown): string {
  try {
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    if (typeof value === "bigint") return `${value.toString()}n`;
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return String(value);
    if (value instanceof Error) {
      return JSON.stringify(
        {
          name: value.name,
          message: value.message,
          stack: value.stack?.split("\n").slice(0, 5).join("\n"),
        },
        null,
        2,
      );
    }
    const seen = new WeakSet();
    return JSON.stringify(
      value,
      (_, v) => {
        if (typeof v === "bigint") return `${v.toString()}n`;
        if (typeof v === "object" && v !== null) {
          if (seen.has(v)) return "[Circular]";
          seen.add(v);
        }
        return v;
      },
      2,
    );
  } catch {
    return "[Unable to stringify]";
  }
}

const LEVEL_STYLES: Record<DebugLog["level"], { bg: string; text: string; label: string }> = {
  info: { bg: "bg-blue-500/10", text: "text-blue-500", label: "INFO" },
  warn: { bg: "bg-yellow-500/10", text: "text-yellow-500", label: "WARN" },
  error: { bg: "bg-red-500/10", text: "text-red-500", label: "ERROR" },
  debug: { bg: "bg-gray-500/10", text: "text-gray-400", label: "DEBUG" },
  event: { bg: "bg-purple-500/10", text: "text-purple-500", label: "EVENT" },
  success: { bg: "bg-green-500/10", text: "text-green-500", label: "OK" },
};

const LEVEL_BORDER: Record<DebugLog["level"], string> = {
  info: "border-l-blue-500",
  warn: "border-l-yellow-500",
  error: "border-l-red-500",
  debug: "border-l-gray-500",
  event: "border-l-purple-500",
  success: "border-l-green-500",
};

export function DebugLogPanel() {
  const logs = useDebugLogs();
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<DebugLog["level"] | "all">("all");
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current && expanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length, expanded]);

  const filteredLogs = filter === "all" ? logs : logs.filter((l) => l.level === filter);

  const handleCopyAll = useCallback(() => {
    const text = filteredLogs
      .map((l) => {
        const time = l.timestamp.toLocaleTimeString("en-US", { hour12: false });
        const data = l.data ? `\n  ${safeStringify(l.data)}` : "";
        return `[${time}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}${data}`;
      })
      .join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [filteredLogs]);

  const errorCount = logs.filter((l) => l.level === "error").length;
  const warnCount = logs.filter((l) => l.level === "warn").length;

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            Debug Logs
            <span className="text-xs font-normal text-muted-foreground">
              ({logs.length} entries)
            </span>
            {errorCount > 0 && (
              <span className="text-xs bg-red-500/20 text-red-500 px-1.5 py-0.5 rounded-full font-medium">
                {errorCount} errors
              </span>
            )}
            {warnCount > 0 && (
              <span className="text-xs bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded-full font-medium">
                {warnCount} warnings
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyAll}
              className="h-7 px-2 text-xs"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearDebugLogs}
              className="h-7 px-2 text-xs"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-7 px-2 text-xs"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
          </div>
        </div>

        {/* Filter tabs */}
        {expanded && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {(["all", "info", "event", "success", "warn", "error", "debug"] as const).map((level) => (
              <button
                key={level}
                onClick={() => setFilter(level)}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-medium uppercase transition-colors",
                  filter === level
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {level}
              </button>
            ))}
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div
            ref={scrollRef}
            className="max-h-[500px] overflow-y-auto space-y-0.5 font-mono text-[11px]"
          >
            {filteredLogs.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-xs">
                No logs yet. Interact with the deposit widget to see detailed debug output.
              </p>
            ) : (
              filteredLogs.map((log) => {
                const style = LEVEL_STYLES[log.level];
                return (
                  <div
                    key={log.id}
                    className={cn(
                      "px-2 py-1.5 rounded border-l-2",
                      style.bg,
                      LEVEL_BORDER[log.level],
                    )}
                  >
                    <div className="flex items-start gap-1.5 flex-wrap">
                      <span className="text-muted-foreground shrink-0 tabular-nums">
                        {log.timestamp.toLocaleTimeString("en-US", {
                          hour12: false,
                          fractionalSecondDigits: 3,
                        })}
                      </span>
                      <span className={cn("font-bold shrink-0 w-12", style.text)}>
                        [{style.label}]
                      </span>
                      <span className="text-muted-foreground shrink-0">
                        [{log.source}]
                      </span>
                      <span className="break-all">{log.message}</span>
                    </div>
                    {log.data !== undefined && (
                      <pre className="mt-1 text-[10px] text-muted-foreground overflow-x-auto bg-background/50 p-1.5 rounded max-h-40 overflow-y-auto">
                        {safeStringify(log.data)}
                      </pre>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
