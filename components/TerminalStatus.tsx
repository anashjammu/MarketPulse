"use client";

import { useEffect, useState } from "react";
import { formatTimeInUserTimeZone, getShortTimeZoneLabel, getUserTimeZone } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export function TerminalStatus() {
  const [clock, setClock] = useState("--:--");
  const [timezone, setTimezone] = useState("Local");

  useEffect(() => {
    const updateStatus = () => {
      const detectedTimeZone = getUserTimeZone();
      setClock(formatTimeInUserTimeZone(new Date(), detectedTimeZone));
      setTimezone(getShortTimeZoneLabel(new Date(), detectedTimeZone));
    };

    updateStatus();
    const intervalId = window.setInterval(updateStatus, 30_000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="grid w-full grid-cols-2 gap-2 text-xs md:w-auto md:grid-cols-[88px_132px]">
      <Status label="Session" value="Research" />
      <Status label={timezone} value={clock} />
    </div>
  );
}

function Status({
  label,
  value,
  className,
  valueClassName
}: {
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-2", className)}>
      <div className="text-[11px] text-terminal-muted">{label}</div>
      <div className={cn("min-w-0 font-mono text-terminal-text", valueClassName)}>{value}</div>
    </div>
  );
}
