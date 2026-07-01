"use client";

import { useEffect, useState } from "react";
import { formatDateTimeInUserTimeZone, formatTimeInUserTimeZone, getUserTimeZone } from "@/lib/timezone";

export function LocalTime({ value, variant = "time" }: { value: string; variant?: "time" | "dateTime" }) {
  const [formatted, setFormatted] = useState("--:-- Local");

  useEffect(() => {
    setFormatted(variant === "dateTime" ? formatDateTimeInUserTimeZone(value) : formatTimeInUserTimeZone(value));
  }, [value, variant]);

  return <span>{formatted}</span>;
}

export function SimpleLocalTime({ value, timestampValid = true }: { value: string; timestampValid?: boolean }) {
  const [formatted, setFormatted] = useState("Time unavailable");

  useEffect(() => {
    const date = new Date(value);
    if (timestampValid === false || !Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 5 * 60 * 1000) {
      setFormatted("Time unavailable");
      return;
    }

    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setFormatted(new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: userTimeZone
    }).format(date));
  }, [timestampValid, value]);

  return <span>{formatted}</span>;
}

export function LocalTimezoneLabel() {
  const [timezone, setTimezone] = useState("Local");

  useEffect(() => {
    setTimezone(getUserTimeZone());
  }, []);

  return <span>{timezone}</span>;
}

export function DataQualityLabel({
  source = "Unavailable",
  status = "unavailable",
  delay = "N/A",
  updatedAt = new Date().toISOString()
}: {
  source?: string;
  status?: string;
  delay?: string;
  updatedAt?: string;
}) {
  return (
    <span className="text-xs text-terminal-muted">
      Data from configured providers. Last updated: <LocalTime value={updatedAt} variant="dateTime" />
    </span>
  );
}
