"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
  type UTCTimestamp
} from "lightweight-charts";
import { chartTimeframes, type ChartTimeframe, type OhlcvCandle } from "@/lib/chart-data";
import { formatDateTimeInUserTimeZone } from "@/lib/timezone";
import { cn } from "@/lib/utils";

type ChartView = "candles" | "line";

type TooltipState = {
  x: number;
  y: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
} | null;

export function InteractivePriceChart({
  title,
  symbol,
  candlesByTimeframe,
  currentPrice,
  initialTimeframe = "1D",
  loading = false,
  error,
  emptyMessage = "No chart data available",
  timezoneLabel = ""
}: {
  title: string;
  symbol: string;
  candlesByTimeframe: Record<ChartTimeframe, OhlcvCandle[]>;
  currentPrice?: number;
  initialTimeframe?: ChartTimeframe;
  loading?: boolean;
  error?: string;
  emptyMessage?: string;
  timezoneLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>(initialTimeframe);
  const [view, setView] = useState<ChartView>("candles");
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [remoteCandles, setRemoteCandles] = useState<Partial<Record<ChartTimeframe, OhlcvCandle[]>>>({});
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | undefined>();

  const candles = remoteCandles[timeframe] ?? candlesByTimeframe[timeframe] ?? [];
  const latestPrice = currentPrice ?? candles.at(-1)?.close;

  const chartData = useMemo(() => {
    return candles.map((candle) => {
      const time = chartTimeFromCandle(candle.time);
      return {
        time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume
      };
    });
  }, [candles]);

  useEffect(() => {
    if (remoteCandles[timeframe]) {
      return;
    }

    const { range, interval } = chartRequestForTimeframe(timeframe);
    const controller = new AbortController();
    setRemoteLoading(true);
    setRemoteError(undefined);

    fetch(`/api/history/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        const nextCandles = payload.data?.candles ?? [];
        setRemoteCandles((current) => ({ ...current, [timeframe]: nextCandles }));
        if (!nextCandles.length) {
          setRemoteError(payload.error ?? `${timeframe} data unavailable from configured providers.`);
        }
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setRemoteError(`${timeframe} data unavailable from configured providers.`);
        }
      })
      .finally(() => setRemoteLoading(false));

    return () => controller.abort();
  }, [candlesByTimeframe, remoteCandles, symbol, timeframe]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || loading || remoteLoading || error || remoteError || chartData.length === 0) {
      return;
    }

    setTooltip(null);
    container.innerHTML = "";

    const chart = createChart(container, {
      autoSize: true,
      height: 360,
      layout: {
        background: { type: ColorType.Solid, color: "#0b1324" },
        textColor: "#9aa8bd",
        fontFamily: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace"
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.07)" },
        horzLines: { color: "rgba(148, 163, 184, 0.08)" }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(56, 217, 255, 0.50)", labelBackgroundColor: "#152238" },
        horzLine: { color: "rgba(56, 217, 255, 0.40)", labelBackgroundColor: "#152238" }
      },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.18)",
        scaleMargins: { top: 0.08, bottom: 0.28 }
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.18)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 8
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true
      },
      localization: {
        priceFormatter: (price: number) => formatPrice(price)
      }
    });

    const primarySeries =
      view === "candles"
        ? chart.addSeries(CandlestickSeries, {
            upColor: "#6ee7b7",
            downColor: "#fb7185",
            borderUpColor: "#6ee7b7",
            borderDownColor: "#fb7185",
            wickUpColor: "#6ee7b7",
            wickDownColor: "#fb7185",
            priceLineVisible: false,
            lastValueVisible: true
          })
        : chart.addSeries(LineSeries, {
            color: "#38d9ff",
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true
          });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 }
    });

    if (view === "candles") {
      primarySeries.setData(chartData.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })) as CandlestickData[]);
    } else {
      primarySeries.setData(chartData.map(({ time, close }) => ({ time, value: close })) as LineData[]);
    }

    volumeSeries.setData(
      chartData.map(({ time, open, close, volume }) => ({
        time,
        value: volume,
        color: close >= open ? "rgba(110, 231, 183, 0.34)" : "rgba(251, 113, 133, 0.34)"
      })) as HistogramData[]
    );

    if (latestPrice) {
      primarySeries.createPriceLine({
        price: latestPrice,
        color: latestPrice >= chartData[0].open ? "#6ee7b7" : "#fb7185",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Last"
      });
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    chart.subscribeCrosshairMove((param) => {
      if (!param.point || !param.time) {
        setTooltip(null);
        return;
      }

      const hoverTime = param.time;
      const raw = chartData.find((item) => chartTimesEqual(item.time, hoverTime));

      if (!raw) {
        setTooltip(null);
        return;
      }

      setTooltip({
        x: Math.min(Math.max(param.point.x + 16, 12), Math.max(container.clientWidth - 220, 12)),
        y: Math.min(Math.max(param.point.y + 16, 12), 220),
        time: formatChartTooltipTime(raw.time),
        open: raw.open,
        high: raw.high,
        low: raw.low,
        close: raw.close,
        volume: raw.volume
      });
    });

    return () => {
      chartRef.current = null;
      chart.remove();
    };
  }, [chartData, error, latestPrice, loading, remoteError, remoteLoading, view]);

  const hasData = chartData.length > 0;

  return (
    <div className="min-w-0 rounded-xl border border-white/[0.10] bg-white/[0.03] shadow-[0_10px_28px_rgba(0,0,0,0.12)]">
      <div className="flex flex-col gap-3 border-b border-white/[0.08] p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-terminal-text">{title}</h3>
            <span className="rounded-full border border-terminal-cyan/25 bg-terminal-cyan/[0.10] px-2.5 py-0.5 text-[11px] text-terminal-cyan">
              {symbol.toUpperCase()}
            </span>
            {latestPrice ? <span className="font-mono text-xs text-terminal-cyan">{formatPrice(latestPrice)}</span> : null}
          </div>
          {timezoneLabel ? <p className="mt-1 text-xs text-terminal-muted">{timezoneLabel}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-white/10 bg-white/[0.02] p-1">
            {(["candles", "line"] as ChartView[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] uppercase tracking-normal transition",
                  view === mode ? "bg-terminal-cyan/[0.22] text-terminal-text" : "text-terminal-muted hover:text-terminal-text"
                )}
              >
                {mode === "candles" ? "Candles" : "Line"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap rounded-lg border border-white/10 bg-white/[0.02] p-1">
            {chartTimeframes.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTimeframe(item)}
                className={cn(
                  "rounded-md px-2 py-1 font-mono text-[11px] transition",
                  timeframe === item ? "bg-white/[0.14] text-terminal-text" : "text-terminal-muted hover:text-terminal-text"
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative min-h-[360px] min-w-0 p-2">
        {loading || remoteLoading ? <ChartState label="Loading chart data..." /> : null}
        {!loading && !remoteLoading && (error || remoteError) ? <ChartState label={error ?? remoteError ?? emptyMessage} tone="error" /> : null}
        {!loading && !remoteLoading && !error && !remoteError && !hasData ? <ChartState label={emptyMessage} /> : null}
        {!loading && !remoteLoading && !error && !remoteError && hasData ? <div ref={containerRef} className="h-[360px] min-w-0" /> : null}
        {tooltip ? (
          <div
            className="pointer-events-none absolute z-10 w-[208px] rounded-xl border border-white/10 bg-[#111b2d]/95 p-3 shadow-2xl backdrop-blur"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="mb-2 border-b border-white/10 pb-2 font-mono text-[11px] text-terminal-cyan">{tooltip.time}</div>
            <TooltipRow label="Open" value={formatPrice(tooltip.open)} />
            <TooltipRow label="High" value={formatPrice(tooltip.high)} />
            <TooltipRow label="Low" value={formatPrice(tooltip.low)} />
            <TooltipRow label="Close" value={formatPrice(tooltip.close)} />
            <TooltipRow label="Volume" value={formatVolume(tooltip.volume)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function chartRequestForTimeframe(timeframe: ChartTimeframe) {
  const map: Record<ChartTimeframe, { range: string; interval: string }> = {
    "1m": { range: "1D", interval: "1m" },
    "5m": { range: "5D", interval: "5m" },
    "15m": { range: "5D", interval: "15m" },
    "30m": { range: "1M", interval: "30m" },
    "1h": { range: "1M", interval: "1h" },
    "4h": { range: "3M", interval: "4h" },
    "1D": { range: "1D", interval: "5m" },
    "5D": { range: "5D", interval: "15m" },
    "1Mo": { range: "1M", interval: "1d" },
    "3Mo": { range: "3M", interval: "1d" },
    "6Mo": { range: "6M", interval: "1d" },
    YTD: { range: "YTD", interval: "1d" },
    "1Y": { range: "1Y", interval: "1d" },
    "5Y": { range: "5Y", interval: "1d" }
  };
  return map[timeframe];
}

function chartTimeFromCandle(value: string): Time {
  const daily = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (daily) {
    return {
      year: Number(daily[1]),
      month: Number(daily[2]),
      day: Number(daily[3])
    };
  }

  return Math.floor(new Date(value).getTime() / 1000) as UTCTimestamp;
}

function chartTimesEqual(left: Time, right: Time) {
  if (typeof left === "number" || typeof right === "number") return left === right;
  if (typeof left === "string" || typeof right === "string") return left === right;
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

function formatChartTooltipTime(time: Time) {
  if (typeof time === "number") return formatDateTimeInUserTimeZone(new Date(time * 1000));
  if (typeof time === "string") return time;
  return `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
}

function ChartState({ label, tone = "muted" }: { label: string; tone?: "muted" | "error" }) {
  return (
    <div
      className={cn(
        "flex min-h-[360px] items-center justify-center rounded border border-dashed px-4 text-center text-sm",
        tone === "error" ? "border-terminal-red/30 text-terminal-red" : "border-white/10 text-terminal-muted"
      )}
    >
      {label}
    </div>
  );
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 font-mono text-[11px]">
      <span className="text-terminal-muted">{label}</span>
      <span className="text-terminal-text">{value}</span>
    </div>
  );
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 2 : 2
  }).format(value);
}

function formatVolume(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}
