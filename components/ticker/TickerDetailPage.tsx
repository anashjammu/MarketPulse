import { DataTable, type Column } from "@/components/DataTable";
import { InteractivePriceChart } from "@/components/InteractivePriceChart";
import { SimpleLocalTime } from "@/components/LocalTime";
import { MetricCard } from "@/components/MetricCard";
import { Panel } from "@/components/Panel";
import { TerminalShell } from "@/components/TerminalShell";
import { TickerLink } from "@/components/TickerLink";
import type { Ticker } from "@/lib/app-data";
import { buildEmptyCandleSet, type ChartTimeframe, type OhlcvCandle } from "@/lib/chart-data";
import { calculateOpportunityScore, type OpportunityScoreResult } from "@/lib/opportunity-scoring";
import { fetchRatingsSignal, type NormalizedRatings, type RatingsMeta } from "@/lib/server/providers/ratings";
import {
  fetchRealEarnings,
  fetchRealFundamentals,
  fetchRealHistory,
  fetchRealProfile,
  fetchRealQuote,
  fetchRealTechnicals,
  fetchRealTickerNews,
  type NormalizedNewsArticle
} from "@/lib/provider-gateway";
import { buildStockerViewInsight } from "@/lib/stocker-insight";
import { enhanceInsightWithAI } from "@/lib/stocker-insight-ai";
import { fetchPeers, fetchTickerOverview, type AssetType, type ETFProfile, type FutureProfile } from "@/lib/ticker-service";

type KeyStat = {
  label: string;
  value: string;
  detail?: string;
};

type TechnicalIndicator = {
  label: string;
  value: string;
  signal: string;
};

type Fundamental = {
  metric: string;
  value: string;
};

type Earnings = {
  quarter: string;
  revenue: string;
  eps: string;
  surprise: string;
  guide: string;
};

type PeerMetrics = {
  marketCap: string;
  pe: string;
  revenueGrowth: string;
  expenseRatio: string;
  dividendYield: string;
  exchange: string;
  category: string;
};

type RelatedNews = {
  time: string;
  headline: string;
  source: string;
  snippet: string;
  relatedTickers: string[];
  url: string;
  timestampValid?: boolean;
};

type TickerDetail = {
  symbol: string;
  name: string;
  assetType: AssetType;
  price: number;
  change: number;
  volume: string;
  marketCap: string;
  pe: string;
  revenueGrowth: string;
  epsGrowth: string;
  weekRange: string;
  analystTargetRange: string;
  rating: string;
  sector: string;
  riskScore: number;
  riskLabel: string;
  forwardPe: string;
  grossMargin: string;
  debtEquity: string;
  averageVolume: string;
  chart: Record<ChartTimeframe, OhlcvCandle[]>;
  keyStats: KeyStat[];
  technicals: TechnicalIndicator[];
  fundamentals: Fundamental[];
  earnings: Earnings[];
  news: RelatedNews[];
  bullCase: string;
  bearCase: string;
  catalysts: string[];
  catalystSummary: string;
  verdict: string;
  unavailableFields: string[];
  opportunityAnalysis: OpportunityScoreResult;
  ratings: NormalizedRatings;
  ratingsMeta: RatingsMeta;
  etfProfile: ETFProfile | null;
  futureProfile: FutureProfile | null;
  peers: Ticker[];
  peerMetrics: Record<string, PeerMetrics>;
  debugMeta: {
    quoteStatus: string;
    historyStatus: string;
    selectedHistoryProvider: string;
    selectedQuoteProvider: string;
    requestedRange: string;
    actualInterval: string;
    candleCount: number;
    keyStatsStatus: string;
    earningsStatus: string;
    peerStatus: string;
    insightInputsAvailable: string[];
    unavailableReasons: string[];
  };
};

const fundamentalColumns: Column<Fundamental>[] = [
  {
    key: "metric",
    header: "Metric",
    render: (row) => (
      <div>
        <div className="text-terminal-cyan">{row.metric}</div>
        <MetricQuickHelp metric={row.metric} value={row.value} />
      </div>
    )
  },
  {
    key: "value",
    header: "Value",
    align: "right",
    render: (row) => (
      <div className="inline-flex flex-col items-end gap-1">
        <span>{row.value}</span>
        <span className="text-[11px] text-terminal-muted">{metricBetterDirection(row.metric)}</span>
      </div>
    )
  }
];

const earningsColumns: Column<Earnings>[] = [
  { key: "quarter", header: "Quarter", render: (row) => <span className="text-terminal-cyan">{row.quarter}</span> },
  { key: "revenue", header: "Revenue", align: "right", render: (row) => row.revenue },
  { key: "eps", header: "EPS", align: "right", render: (row) => row.eps },
  { key: "surprise", header: "Surprise", align: "right", render: (row) => <span className="text-terminal-green">{row.surprise}</span> },
  { key: "guide", header: "Guide", align: "right", render: (row) => row.guide }
];

const newsColumns: Column<RelatedNews>[] = [
  { key: "time", header: "Time", render: (row) => <span className="text-terminal-cyan"><SimpleLocalTime value={row.time} timestampValid={row.timestampValid} /></span> },
  { key: "headline", header: "Headline", render: (row) => row.headline },
  { key: "source", header: "Source", render: (row) => row.source }
];

export async function TickerDetailPage({ symbol: rawSymbol }: { symbol: string }) {
  const symbol = decodeURIComponent(rawSymbol).trim().toUpperCase();
  const [quotePayload, profilePayload, newsPayload, technicalPayload, fundamentalsPayload, earningsPayload, peerPayload] = await Promise.all([
    fetchRealQuote(symbol),
    fetchRealProfile(symbol),
    fetchRealTickerNews(symbol),
    fetchRealTechnicals(symbol),
    fetchRealFundamentals(symbol),
    fetchRealEarnings(symbol),
    fetchRealPeers(symbol)
  ]);
  const [history1D, history5D, history1Mo, history3Mo, history6Mo, historyYtd, history1Y, history5Y] = await Promise.all([
    fetchRealHistory(symbol, { range: "1D", interval: "5m" }),
    fetchRealHistory(symbol, { range: "5D", interval: "30m" }),
    fetchRealHistory(symbol, { range: "1Mo", interval: "1d" }),
    fetchRealHistory(symbol, { range: "3Mo", interval: "1d" }),
    fetchRealHistory(symbol, { range: "6Mo", interval: "1d" }),
    fetchRealHistory(symbol, { range: "YTD", interval: "1d" }),
    fetchRealHistory(symbol, { range: "1Y", interval: "1d" }),
    fetchRealHistory(symbol, { range: "5Y", interval: "1wk" })
  ]);
  const ratingsPayload = await fetchRatingsSignal(symbol, newsPayload.data ?? []);
  const detail = buildTickerDetail(symbol, {
    quote: quotePayload.data,
    profile: profilePayload.data,
    chartByRange: {
      "1D": history1D.data?.candles ?? [],
      "5D": history5D.data?.candles ?? [],
      "1Mo": history1Mo.data?.candles ?? [],
      "3Mo": history3Mo.data?.candles ?? [],
      "6Mo": history6Mo.data?.candles ?? [],
      YTD: historyYtd.data?.candles ?? [],
      "1Y": history1Y.data?.candles ?? [],
      "5Y": history5Y.data?.candles ?? []
    },
    news: newsPayload.data ?? [],
    technicals: technicalPayload.data ?? [],
    fundamentals: fundamentalsPayload.data ?? [],
    earnings: earningsPayload.data ?? [],
    ratings: ratingsPayload.data,
    ratingsMeta: ratingsPayload.meta,
    peers: peerPayload.peers,
    peerMetrics: peerPayload.metrics,
    payloads: {
      quotePayload,
      profilePayload,
      history5D,
      fundamentalsPayload,
      earningsPayload,
      newsPayload
    }
  });

  if (!detail) {
    return (
      <TerminalShell active="" title="Ticker not found" subtitle="The requested symbol could not be resolved.">
        <Panel title="Ticker not found">
          <div className="rounded-lg border border-terminal-line bg-terminal-panel2 p-6 text-sm text-terminal-muted">Ticker not found</div>
        </Panel>
      </TerminalShell>
    );
  }

  return (
    <TerminalShell
      active=""
      title={`${detail.symbol} Research`}
      subtitle="Price chart, key stats, setup analysis, earnings, latest news, peer comparison, and StockerView Insight."
    >
      <div className="grid gap-4 md:gap-5">
        <Panel
          title={
            <>
              <TickerLink symbol={detail.symbol} /> Security Overview
            </>
          }
          action={<span className="font-mono text-xs text-terminal-muted">{detail.rating}</span>}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label={detail.name} value={detail.price > 0 ? `$${detail.price.toFixed(2)}` : "Data unavailable"} change={detail.price > 0 ? detail.change : undefined} />
            <MetricCard label="Daily Change" value={formatChange(detail.change)} />
            <MetricCard label="Volume" value={detail.volume} />
            <MetricCard label={detail.assetType === "future" ? "Exchange" : detail.assetType === "ETF" ? "AUM" : "Market Cap"} value={detail.marketCap} detail={formatAssetType(detail.assetType)} />
          </div>
        </Panel>

        <BeginnerTopInsight detail={detail} />

        {detail.unavailableFields.length ? (
          <Panel title="Some data unavailable">
            <div className="rounded-lg border border-terminal-amber/20 bg-terminal-panel2 p-4 text-sm text-terminal-amber">
              Data unavailable from configured providers: {detail.unavailableFields.join(", ")}.
            </div>
          </Panel>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <InteractivePriceChart
            title={`${detail.symbol} Price Chart`}
            symbol={detail.symbol}
            candlesByTimeframe={detail.chart}
            currentPrice={detail.price}
          />

          <Panel title="Key Stats">
            <p className="mb-3 text-xs leading-5 text-terminal-muted">
              Quick numbers below. Hover the metric labels in Fundamentals for deeper "why this matters" explanations.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {buildKeyStats(detail).map((stat) => (
                <ResearchCard key={stat.label} label={stat.label} value={stat.value} detail={stat.detail} />
              ))}
            </div>
          </Panel>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <Panel title="Technical Indicators">
            <p className="mb-3 text-xs leading-5 text-terminal-muted">
              Technicals show trend and momentum. They do not guarantee direction, but they can help you judge if the setup looks stronger, mixed, or weaker.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {detail.technicals.map((indicator) => (
                <ResearchCard key={indicator.label} label={indicator.label} value={indicator.value} detail={buildTechnicalWhy(detail, indicator)} />
              ))}
            </div>
          </Panel>

          {detail.assetType === "future" && detail.futureProfile ? <FuturesDetails profile={detail.futureProfile} /> : detail.assetType === "ETF" && detail.etfProfile ? <ETFDetails profile={detail.etfProfile} /> : (
            <Panel
              title="Fundamentals"
              action={<span className="text-xs text-terminal-muted">Hover metric names for plain-language explanations</span>}
            >
              <p className="mb-3 text-xs leading-5 text-terminal-muted">
                These business metrics help explain quality, growth, valuation, and balance sheet risk. Educational tool only. Not financial advice.
              </p>
              <DataTable columns={fundamentalColumns} rows={detail.fundamentals} />
            </Panel>
          )}
        </div>

        <OpportunityAnalysis analysis={detail.opportunityAnalysis} />

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Earnings Info">
            {detail.earnings.length ? (
              <DataTable columns={earningsColumns} rows={detail.earnings} />
            ) : (
              <div className="rounded-lg border border-terminal-line bg-terminal-panel2 p-4 text-sm text-terminal-muted">
                Earnings data unavailable from configured providers.
              </div>
            )}
          </Panel>

          <Panel title="Latest News">
            <div className="grid gap-2">
              {detail.news.map((item) => (
                <article key={`${item.time}-${item.headline}`} className="rounded-lg border border-terminal-line bg-terminal-panel2 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-terminal-muted">
                    <SimpleLocalTime value={item.time} timestampValid={item.timestampValid} />
                    <span aria-hidden="true">·</span>
                    <span>{item.source}</span>
                  </div>
                  <h3 className="mt-2 text-[0.95rem] font-semibold leading-5 tracking-[-0.01em] text-terminal-text">{item.headline}</h3>
                  {item.snippet ? <p className="mt-2 text-xs leading-5 text-terminal-muted">{item.snippet}</p> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-terminal-cyan underline-offset-4 hover:underline">
                      Read original article
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </Panel>
        </div>

        <Panel title="Peer Comparison">
          {detail.peers.length ? (
            <DataTable
              columns={[
                { key: "symbol", header: "Ticker", render: (row: Ticker) => <TickerLink symbol={row.symbol} /> },
                { key: "name", header: "Name", render: (row: Ticker) => row.name },
                { key: "price", header: "Price", align: "right", render: (row: Ticker) => row.price > 0 ? `$${row.price.toFixed(2)}` : "Unavailable" },
                { key: "change", header: "Daily %", align: "right", render: (row: Ticker) => formatChange(row.change) },
                { key: "size", header: detail.assetType === "ETF" ? "AUM" : "Market Cap", align: "right", render: (row: Ticker) => peerOverviewValue(detail.peerMetrics, row.symbol, "marketCap") },
                { key: "valuation", header: detail.assetType === "ETF" ? "Expense Ratio" : detail.assetType === "future" ? "Exchange" : "P/E", align: "right", render: (row: Ticker) => peerOverviewValue(detail.peerMetrics, row.symbol, detail.assetType === "ETF" ? "expenseRatio" : detail.assetType === "future" ? "exchange" : "pe") },
                { key: "growth", header: detail.assetType === "ETF" ? "Dividend Yield" : detail.assetType === "future" ? "Category" : "Revenue Growth", align: "right", render: (row: Ticker) => peerOverviewValue(detail.peerMetrics, row.symbol, detail.assetType === "ETF" ? "dividendYield" : detail.assetType === "future" ? "category" : "revenueGrowth") }
              ]}
              rows={detail.peers}
            />
          ) : (
            <div className="rounded-lg border border-terminal-line bg-terminal-panel2 p-4 text-sm text-terminal-muted">
              Peer data unavailable from configured providers.
            </div>
          )}
        </Panel>

      </div>
    </TerminalShell>
  );
}

function buildTickerDetail(
  symbol: string,
  providerData: {
    quote: Awaited<ReturnType<typeof fetchRealQuote>>["data"];
    profile: Awaited<ReturnType<typeof fetchRealProfile>>["data"];
    chartByRange: Record<ChartTimeframe, OhlcvCandle[]>;
    news: NormalizedNewsArticle[];
    technicals: TechnicalIndicator[];
    fundamentals: Fundamental[];
    earnings: Earnings[];
    ratings: NormalizedRatings;
    ratingsMeta: RatingsMeta;
    peers: Ticker[];
    peerMetrics: Record<string, PeerMetrics>;
    payloads: {
      quotePayload: Awaited<ReturnType<typeof fetchRealQuote>>;
      profilePayload: Awaited<ReturnType<typeof fetchRealProfile>>;
      history5D: Awaited<ReturnType<typeof fetchRealHistory>>;
      fundamentalsPayload: Awaited<ReturnType<typeof fetchRealFundamentals>>;
      earningsPayload: Awaited<ReturnType<typeof fetchRealEarnings>>;
      newsPayload: Awaited<ReturnType<typeof fetchRealTickerNews>>;
    };
  }
): TickerDetail | null {
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) {
    return null;
  }

  const overview = fetchTickerOverview(symbol);

  if (overview.assetType === "future") {
    return null;
  }

  const quotePrice = providerData.quote?.price ?? 0;
  const change = providerData.quote?.changePercent ?? overview.change;
  const name = providerData.profile?.companyName ?? providerData.quote?.name ?? overview.name;
  const sector = providerData.profile?.sector ?? "Unavailable";
  const revenueGrowth = fundamentalValue(providerData.fundamentals, "Revenue Growth");
  const epsGrowth = fundamentalValue(providerData.fundamentals, "EPS Growth");
  const volume = providerData.quote?.volume ? formatCompactNumber(providerData.quote.volume) : "Unavailable";
  const marketCap = providerData.quote?.marketCap ?? providerData.profile?.marketCap;
  const pe = fundamentalValue(providerData.fundamentals, "P/E");
  const analystTargetRange = fundamentalValue(providerData.fundamentals, "Analyst Target Range") === "Unavailable" ? "Unavailable" : fundamentalValue(providerData.fundamentals, "Analyst Target Range");
  const riskScore = 0;
  const riskLabel = "Data unavailable";
  const catalysts = ["Data unavailable"];
  const opportunityAnalysis = calculateOpportunityScore({
    symbol,
    price: quotePrice,
    dayHigh: providerData.quote?.dayHigh,
    dayLow: providerData.quote?.dayLow,
    technicals: providerData.technicals,
    fundamentals: providerData.fundamentals,
    news: providerData.news,
    candles: providerData.chartByRange["1Y"] ?? [],
    ratings: providerData.ratings,
    ratingsMeta: providerData.ratingsMeta
  });

  return {
    symbol,
    name,
    assetType: overview.assetType,
    price: quotePrice,
    change,
    volume,
    marketCap: marketCap ? formatLargeNumber(marketCap) : fundamentalValue(providerData.fundamentals, "Market Cap"),
    pe,
    revenueGrowth,
    epsGrowth,
    weekRange: providerData.quote?.dayLow && providerData.quote?.dayHigh ? `$${providerData.quote.dayLow.toFixed(2)} - $${providerData.quote.dayHigh.toFixed(2)}` : "Unavailable",
    analystTargetRange,
    rating: providerData.quote ? "Real provider data" : "Provider unavailable",
    sector,
    riskScore,
    riskLabel,
    forwardPe: "Unavailable",
    grossMargin: fundamentalValue(providerData.fundamentals, "Gross Margin"),
    debtEquity: fundamentalValue(providerData.fundamentals, "Debt/Equity"),
    averageVolume: fundamentalValue(providerData.fundamentals, "Average Volume"),
    chart: providerData.chartByRange,
    keyStats: [
      { label: "Sector", value: sector },
      { label: "Relative Volume", value: relativeVolumeValue(providerData.technicals) },
      { label: "Forward P/E", value: fundamentalValue(providerData.fundamentals, "Forward P/E") },
      { label: "Revenue Growth", value: revenueGrowth },
      { label: "EPS Growth", value: epsGrowth },
      { label: "Debt/Equity", value: fundamentalValue(providerData.fundamentals, "Debt/Equity") },
      { label: "Average Volume", value: fundamentalValue(providerData.fundamentals, "Average Volume") },
      ...(overview.assetType === "ETF" && overview.etfProfile
        ? [
            { label: "Expense Ratio", value: overview.etfProfile.expenseRatio },
            { label: "Holdings", value: overview.etfProfile.holdingsCount }
          ]
        : [{ label: "Analyst Target Range", value: analystTargetRange }])
    ],
    technicals: providerData.technicals,
    fundamentals: providerData.fundamentals,
    earnings: providerData.earnings,
    news: providerData.news.map(articleToRelatedNews),
    bullCase: "Data unavailable.",
    bearCase: "Data unavailable.",
    catalysts,
    catalystSummary: "Data unavailable.",
    verdict: "Research verdict unavailable until provider data is connected.",
    unavailableFields: [
      ...(!providerData.quote ? ["quote"] : []),
      ...(!Object.values(providerData.chartByRange).some((rows) => rows.length) ? ["chart history"] : []),
      ...(!providerData.fundamentals.length ? ["fundamentals"] : []),
      ...(!providerData.earnings.length ? ["earnings"] : []),
      ...(!providerData.news.length ? ["news"] : []),
      ...(!providerData.peers.length ? ["peer comparison"] : [])
    ],
    opportunityAnalysis,
    ratings: providerData.ratings,
    ratingsMeta: providerData.ratingsMeta,
    etfProfile: overview.assetType === "ETF" ? overview.etfProfile : null,
    futureProfile: null,
    peers: providerData.peers,
    peerMetrics: providerData.peerMetrics,
    debugMeta: {
      quoteStatus: providerData.payloads.quotePayload.status,
      historyStatus: providerData.payloads.history5D.status,
      selectedHistoryProvider: providerData.payloads.history5D.source,
      selectedQuoteProvider: providerData.payloads.quotePayload.source,
      requestedRange: "5D",
      actualInterval: String(providerData.payloads.history5D.meta?.requestedInterval ?? "30m"),
      candleCount: providerData.payloads.history5D.meta?.candleCount ?? providerData.chartByRange["5D"].length,
      keyStatsStatus: providerData.payloads.fundamentalsPayload.status,
      earningsStatus: providerData.payloads.earningsPayload.status,
      peerStatus: providerData.peers.length ? "available" : "unavailable",
      insightInputsAvailable: [
        ...(providerData.quote ? ["quote"] : []),
        ...(providerData.chartByRange["5D"].length ? ["history"] : []),
        ...(providerData.fundamentals.length ? ["keyStats"] : []),
        ...(providerData.earnings.length ? ["earnings"] : []),
        ...(providerData.peers.length ? ["peers"] : []),
        ...(providerData.news.length ? ["news"] : [])
      ],
      unavailableReasons: [
        ...(!providerData.quote ? [providerData.payloads.quotePayload.error ?? "Quote unavailable"] : []),
        ...(!providerData.chartByRange["5D"].length ? [providerData.payloads.history5D.error ?? "History unavailable"] : []),
        ...(!providerData.fundamentals.length ? [providerData.payloads.fundamentalsPayload.error ?? "Key stats unavailable"] : []),
        ...(!providerData.earnings.length ? [providerData.payloads.earningsPayload.error ?? "Earnings unavailable"] : []),
        ...(!providerData.peers.length ? ["Peer data unavailable from configured providers."] : [])
      ]
    }
  };
}

async function fetchRealPeers(symbol: string): Promise<{ peers: Ticker[]; metrics: Record<string, PeerMetrics> }> {
  const peers = fetchPeers(symbol);
  if (!peers.length) return { peers: [], metrics: {} };
  const [quotes, fundamentals] = await Promise.all([
    Promise.all(peers.map((peer) => fetchRealQuote(peer.symbol))),
    Promise.all(peers.map((peer) => fetchRealFundamentals(peer.symbol)))
  ]);

  const metrics: Record<string, PeerMetrics> = {};

  const hydrated = peers.map((peer, index) => {
    const quote = quotes[index].data;
    const rows = fundamentals[index].data ?? [];
    const overview = fetchTickerOverview(peer.symbol);
    const revenueGrowth = fundamentalValue(rows, "Revenue Growth");
    const pe = fundamentalValue(rows, "P/E");
    const marketCapFromFundamentals = parseCurrencyValue(fundamentalValue(rows, "Market Cap"));

    metrics[peer.symbol.toUpperCase()] = {
      marketCap: quote?.marketCap
        ? formatLargeNumber(quote.marketCap)
        : marketCapFromFundamentals
          ? formatLargeNumber(marketCapFromFundamentals)
          : "Unavailable",
      pe: pe !== "Unavailable" ? pe : "Unavailable",
      revenueGrowth: revenueGrowth !== "Unavailable" ? revenueGrowth : "Unavailable",
      expenseRatio: overview.assetType === "ETF" ? overview.etfProfile.expenseRatio : "N/A",
      dividendYield: overview.assetType === "ETF" ? overview.etfProfile.dividendYield : "N/A",
      exchange: overview.assetType === "future" ? overview.futureProfile.exchange : "N/A",
      category: overview.assetType === "future" ? overview.futureProfile.category : "N/A"
    };

    return {
      ...peer,
      name: quote?.name ?? peer.name,
      price: quote?.price ?? 0,
      change: quote?.changePercent ?? 0,
      volume: quote?.volume ? formatCompactNumber(quote.volume) : "Unavailable",
      marketCap: metrics[peer.symbol.toUpperCase()].marketCap,
      sector: fundamentalValue(rows, "Sector") !== "Unavailable" ? fundamentalValue(rows, "Sector") : peer.sector
    };
  });

  return { peers: hydrated, metrics };
}

function fundamentalValue(rows: Fundamental[], metric: string) {
  return rows.find((row) => row.metric === metric)?.value ?? "Unavailable";
}

function relativeVolumeValue(rows: TechnicalIndicator[]) {
  return rows.find((row) => row.label.toLowerCase().includes("volume"))?.value ?? "Unavailable";
}

function formatChange(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function articleToRelatedNews(article: NormalizedNewsArticle): RelatedNews {
  return {
    time: article.publishedAt,
    headline: article.headline,
    source: article.sourceName,
    snippet: article.snippet,
    relatedTickers: article.relatedTickers.length ? article.relatedTickers : [],
    url: article.url,
    timestampValid: article.timestampValid
  };
}

function formatLargeNumber(value: number) {
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function parseCurrencyValue(value: string) {
  if (!value || value === "Unavailable") return null;
  const normalized = value.replace(/[$,\s]/g, "").toUpperCase();
  const multiplier = normalized.endsWith("T")
    ? 1_000_000_000_000
    : normalized.endsWith("B")
      ? 1_000_000_000
      : normalized.endsWith("M")
        ? 1_000_000
        : normalized.endsWith("K")
          ? 1_000
          : 1;
  const numeric = Number(normalized.replace(/[TBMK]$/, ""));
  return Number.isFinite(numeric) ? numeric * multiplier : null;
}

function buildTechnicals(seed: number, price: number): TechnicalIndicator[] {
  const rsi = 38 + (seed % 34);

  return [
    { label: "RSI 14D", value: rsi.toFixed(1), signal: rsi > 62 ? "Extended / Bullish" : rsi < 45 ? "Soft / Watch support" : "Neutral" },
    { label: "MACD", value: `${seed % 2 === 0 ? "+" : "-"}${((seed % 18) / 10).toFixed(2)}`, signal: seed % 2 === 0 ? "Positive crossover" : "Momentum cooling" },
    { label: "50D MA", value: `$${(price * 0.94).toFixed(2)}`, signal: "Price above intermediate trend" },
    { label: "200D MA", value: `$${(price * 0.78).toFixed(2)}`, signal: "Long-term trend support" },
    { label: "Volume", value: `${(0.9 + (seed % 7) / 10).toFixed(2)}x avg`, signal: "Normal participation" },
    { label: "ATR", value: `$${(price * 0.038).toFixed(2)}`, signal: "Position sizing input" }
  ];
}

function buildKeyStats(detail: TickerDetail): KeyStat[] {
  if (detail.assetType === "future" && detail.futureProfile) {
    return [
      { label: "Contract Name", value: detail.futureProfile.name },
      { label: "Asset Type", value: "Future", detail: detail.futureProfile.category },
      { label: "Session High", value: detail.futureProfile.sessionHigh },
      { label: "Session Low", value: detail.futureProfile.sessionLow },
      { label: "Open Interest", value: detail.futureProfile.openInterest },
      { label: "Contract Month", value: detail.futureProfile.contractMonth },
      { label: "Tick Size", value: detail.futureProfile.tickSize },
      { label: "Tick Value", value: detail.futureProfile.tickValue },
      { label: "Point Value", value: detail.futureProfile.pointValue },
      { label: "Exchange", value: detail.futureProfile.exchange },
      { label: "Average Volume", value: detail.averageVolume },
      { label: "Relative Volume", value: detail.keyStats.find((stat) => stat.label === "Relative Volume")?.value ?? "-" }
    ];
  }

  return [
    { label: "P/E", value: detail.pe, detail: detail.assetType === "ETF" ? "Not applicable" : undefined },
    { label: "Forward P/E", value: detail.forwardPe, detail: detail.assetType === "ETF" ? "Not applicable" : undefined },
    { label: "Revenue Growth", value: detail.revenueGrowth },
    { label: "EPS Growth", value: detail.epsGrowth },
    { label: "Gross Margin", value: detail.grossMargin },
    { label: "Debt/Equity", value: detail.debtEquity },
    { label: "52-Week Range", value: detail.weekRange },
    { label: "Average Volume", value: detail.averageVolume },
    ...detail.keyStats
  ];
}

function peerOverviewValue(
  metricMap: Record<string, PeerMetrics>,
  symbol: string,
  field: "marketCap" | "pe" | "revenueGrowth" | "expenseRatio" | "dividendYield" | "exchange" | "category"
) {
  const metric = metricMap[symbol.toUpperCase()];
  if (!metric) return "Unavailable";
  return metric[field] || "Unavailable";
}

function formatAssetType(assetType: AssetType) {
  if (assetType === "future") return "Future";
  if (assetType === "stock") return "Stock";
  return assetType;
}

async function BeginnerTopInsight({ detail }: { detail: TickerDetail }) {
  const profile = await beginnerInsightData(detail);

  return (
    <Panel
      title={`${detail.symbol} Why This Stock Matters`}
      action={<span className="text-xs text-terminal-muted">StockerView Insight</span>}
    >
      <div className="grid gap-3">
        <div className="rounded-xl border border-terminal-line bg-terminal-panel2 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-terminal-muted">Action label</div>
              <div className="mt-2"><SimpleTonePill label={profile.actionLabel} /></div>
              <div className="mt-2 text-xs text-terminal-muted">Style: {profile.actionStyle}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-terminal-muted">StockerView Score</div>
              <div className="mt-2 text-2xl font-semibold text-terminal-cyan">{formatInsightScore(profile.score)}</div>
              <div className="mt-2 text-xs text-terminal-muted">Educational label only. Not financial advice.</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-terminal-muted">{profile.summaryModeText}</div>
        </div>

        <InsightBlock title="Simple Answer" text={profile.simpleAnswer} label={profile.simpleLabel} />
        <div className="rounded-xl border border-terminal-line bg-terminal-panel2 p-3">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-terminal-muted">Quick reasons</div>
          <ul className="mt-2 space-y-1.5">
            {profile.quickReasons.map((item) => (
              <li key={item} className="text-sm leading-6 text-terminal-text">
                <span className="mr-2 text-terminal-cyan">-</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <details className="rounded-xl border border-terminal-line bg-terminal-panel2 p-3">
          <summary className="inline-flex cursor-pointer items-center rounded-md border border-terminal-line bg-terminal-panel px-3 py-1.5 text-xs text-terminal-text hover:border-terminal-cyan/30">
            Expand insight
          </summary>
          <div className="mt-3 grid gap-3">
            <InsightBlock title="News Summary" text={profile.newsSummary} />
            <div className="grid gap-3 xl:grid-cols-2">
              <InsightListBlock title="What Looks Positive" items={profile.whatLooksGood} tone="good" />
              <InsightListBlock title="What Looks Concerning" items={profile.whatLooksRisky} tone="risk" />
            </div>
            <InsightBlock title="Chart / Trend" text={profile.chartTrendExplanation} />
            <InsightBlock title="Look Now or Wait?" text={profile.researchOrWait} />
            <div className="grid gap-3 xl:grid-cols-2">
              <InsightListBlock title="What would make this stronger" items={profile.whatImproves} tone="neutral" />
              <InsightListBlock title="What would make this weaker" items={profile.whatWeakens} tone="neutral" />
            </div>
            <InsightArticleList articles={profile.articlesUsed} />
          </div>
        </details>
        <p className="text-xs leading-5 text-terminal-muted">{profile.disclaimer}</p>
      </div>
    </Panel>
  );
}

function formatInsightScore(score: number | null) {
  return score === null ? "Limited data" : `${score}/100`;
}

function InsightBlock({ title, text, label }: { title: string; text: string; label?: string }) {
  return (
    <div className="rounded-xl border border-terminal-line bg-terminal-panel2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-[0.08em] text-terminal-muted">{title}</div>
        {label ? <SimpleTonePill label={label} /> : null}
      </div>
      <p className="mt-2 text-sm leading-6 text-terminal-text">{text}</p>
    </div>
  );
}

function SimpleTonePill({ label }: { label: string }) {
  const normalized = label.toLowerCase();
  const tone = normalized.includes("strong")
    ? "border-terminal-green/25 text-terminal-green"
    : normalized.includes("mixed") || normalized.includes("watch")
      ? "border-terminal-cyan/25 text-terminal-cyan"
      : normalized.includes("risk") || normalized.includes("data")
        ? "border-terminal-amber/25 text-terminal-amber"
        : "border-terminal-line text-terminal-text";
  return <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs ${tone}`}>{label}</span>;
}

function InsightListBlock({ title, items, tone }: { title: string; items: string[]; tone: "good" | "risk" | "neutral" }) {
  const color = tone === "good" ? "text-terminal-green" : tone === "risk" ? "text-terminal-amber" : "text-terminal-cyan";
  return (
    <div className="rounded-xl border border-terminal-line bg-terminal-panel2 p-3">
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-terminal-muted">{title}</div>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="text-sm leading-6 text-terminal-text">
            <span className={`mr-2 ${color}`}>-</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function InsightArticleList({ articles }: { articles: Array<{ title: string; source: string; time: string; url: string; snippet: string }> }) {
  if (!articles.length) {
    return (
      <div className="rounded-xl border border-terminal-line bg-terminal-panel2 p-3">
        <div className="text-xs font-medium uppercase tracking-[0.08em] text-terminal-muted">Recent articles used</div>
        <p className="mt-2 text-sm text-terminal-muted">No recent ticker-specific articles were available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-terminal-line bg-terminal-panel2 p-3">
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-terminal-muted">Recent articles used</div>
      <div className="mt-2 grid gap-2">
        {articles.map((article) => (
          <a
            key={`${article.url}-${article.title}`}
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-terminal-line bg-terminal-panel p-2 text-xs leading-5 text-terminal-muted transition hover:border-terminal-cyan/30 hover:text-terminal-text"
          >
            <div className="text-terminal-text">{article.title}</div>
            <div className="mt-1">{article.source} · <SimpleLocalTime value={article.time} /></div>
            {article.snippet ? <div className="mt-1">{article.snippet}</div> : null}
          </a>
        ))}
      </div>
    </div>
  );
}

async function beginnerInsightData(detail: TickerDetail) {
  const overview = {
    ...fetchTickerOverview(detail.symbol),
    symbol: detail.symbol,
    name: detail.name,
    changePercent: detail.change
  };

  const ruleBasedInsight = buildStockerViewInsight({
    symbol: detail.symbol,
    companyName: detail.name,
    overview,
    technicals: detail.technicals,
    fundamentals: detail.fundamentals.map((row) => ({ ...row, context: "ticker detail" })),
    earnings: detail.earnings,
    news: detail.news.map((item) => ({
      id: `${item.time}-${item.headline}`,
      headline: item.headline,
      title: item.headline,
      sourceName: item.source,
      url: item.url,
      publishedAt: item.time,
      publishedLocalTime: item.time,
      localDateBucket: "today",
      primaryCategory: "Ticker",
      categories: ["Ticker"],
      category: "Ticker",
      relatedTickers: item.relatedTickers,
      snippet: item.snippet
    })),
    ratings: detail.ratings,
    peerChanges: detail.peers.map((peer) => ({ symbol: peer.symbol, change: peer.change })),
    opportunity: detail.opportunityAnalysis
  });

  const enhanced = await enhanceInsightWithAI(ruleBasedInsight);
  const aiInsight = enhanced.insight;

  const enrichedArticles = aiInsight.articlesUsed.map((article) => {
    const match = ruleBasedInsight.articlesUsed.find((candidate) => candidate.url === article.url);
    return {
      title: article.title,
      source: article.source,
      url: article.url,
      time: match?.time ?? ruleBasedInsight.generatedAt,
      snippet: match?.snippet ?? ""
    };
  });

  const quickReasons = [
    ruleBasedInsight.quickReasons[0],
    aiInsight.whatLooksPositive[0] ?? ruleBasedInsight.quickReasons[1],
    aiInsight.whatLooksConcerning[0] ?? ruleBasedInsight.quickReasons[2]
  ].filter(Boolean).slice(0, 3);

  return {
    simpleAnswer: aiInsight.simpleAnswer,
    whatLooksGood: aiInsight.whatLooksPositive,
    whatLooksRisky: aiInsight.whatLooksConcerning,
    whyMoving: aiInsight.whyMoving,
    researchOrWait: aiInsight.lookNowOrWait,
    whatImproves: aiInsight.whatWouldImprove,
    whatWeakens: aiInsight.whatWouldWorsen,
    simpleLabel: aiInsight.actionLabel,
    quickReasons,
    actionLabel: aiInsight.actionLabel,
    actionStyle: ruleBasedInsight.actionStyle,
    score: aiInsight.score,
    newsSummary: ruleBasedInsight.newsSummary,
    chartTrendExplanation: ruleBasedInsight.chartTrendExplanation,
    articlesUsed: enrichedArticles,
    disclaimer: ruleBasedInsight.disclaimer,
    summaryModeText: enhanced.aiAssisted
      ? "AI-assisted summary from available market data and articles."
      : "Summary from available market data and articles."
  };
}

function compactReason(reason: string) {
  return reason
    .replace("The stock is ", "")
    .replace("right now", "")
    .replace("This may be related to", "May be related to")
    .replace("company-specific", "company")
    .trim();
}

function buildTechnicalWhy(detail: TickerDetail, indicator: TechnicalIndicator) {
  const value = indicator.value;
  if (indicator.label.includes("RSI")) {
    const numeric = parseFirstNumber(value);
    const state = numeric === null ? "Data unavailable" : numeric > 70 ? "high" : numeric < 30 ? "low" : "near neutral";
    return `RSI is ${value}. RSI is a momentum gauge. Around 50 is neutral. Current read looks ${state}.`;
  }
  if (indicator.label.includes("20D MA")) {
    return `Short-term trend level is ${value}. If price is above it, short-term trend is usually stronger.`;
  }
  if (indicator.label.includes("50D MA")) {
    return `Medium-term trend level is ${value}. If price is above it, trend strength is usually improving.`;
  }
  if (indicator.label.includes("200D MA")) {
    return `Long-term trend level is ${value}. This helps show the bigger trend direction.`;
  }
  if (indicator.label.includes("Volume")) {
    return `Trading activity is ${volumeSummary(value)}. Heavier activity can make a move more meaningful.`;
  }
  if (indicator.label.includes("MACD")) {
    return `MACD is ${value}. This helps show whether momentum is improving or fading.`;
  }
  return `${indicator.signal}. This matters because it adds context beyond the raw price.`;
}

function MetricQuickHelp({ metric, value }: { metric: string; value: string }) {
  const help = metricHelp(metric, value);
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[11px] leading-5 text-terminal-muted hover:text-terminal-text">Why this matters</summary>
      <div className="mt-1 rounded-md border border-terminal-line bg-terminal-panel px-2 py-1.5 text-[11px] leading-5 text-terminal-muted">
        {help}
      </div>
    </details>
  );
}

function metricHelp(metric: string, value: string) {
  const normalized = metric.toLowerCase();
  if (normalized === "p/e") {
    return `P/E shows how much investors pay for each $1 of earnings. Higher P/E can mean higher growth expectations, but it can also mean the stock is expensive. Current value: ${value}.`;
  }
  if (normalized === "forward p/e") {
    return `Forward P/E uses expected future earnings instead of past earnings. It can help show what the market is pricing in next. Current value: ${value}.`;
  }
  if (normalized === "revenue growth") {
    return `Revenue growth shows whether the company is selling more than before. Strong growth can signal rising demand. Current value: ${value}.`;
  }
  if (normalized === "gross margin") {
    return `Gross margin shows how much money the company keeps after product costs. Higher is usually better because it can mean pricing power or efficient operations. Current value: ${value}.`;
  }
  if (normalized === "return on equity") {
    return `ROE shows how well the company turns shareholder money into profit. Higher is usually better, but very high ROE should be checked with debt levels. Current value: ${value}.`;
  }
  if (normalized === "debt/equity") {
    return `Debt/Equity shows how much debt the company uses versus shareholder equity. Lower is often safer, while very high debt can increase risk in downturns. Current value: ${value}.`;
  }
  if (normalized === "price/sales") {
    return `Price/Sales compares stock price with revenue. Lower can be cheaper, but this metric should be combined with growth and margins. Current value: ${value}.`;
  }
  if (normalized === "price/book") {
    return `Price/Book compares stock price with accounting book value. It can help compare valuation across similar businesses. Current value: ${value}.`;
  }
  if (normalized === "average volume") {
    return `Average volume shows typical trading activity. More liquidity can make entries and exits easier. Current value: ${value}.`;
  }
  return `${metric} helps describe business quality, growth, valuation, or risk. Current value: ${value}.`;
}

function metricBetterDirection(metric: string) {
  const normalized = metric.toLowerCase();
  if (normalized === "debt/equity") return "Usually lower is less risky";
  if (normalized === "p/e" || normalized === "forward p/e" || normalized === "price/sales" || normalized === "price/book") return "Lower can be cheaper, context matters";
  if (normalized === "revenue growth" || normalized === "gross margin" || normalized === "return on equity" || normalized === "eps growth") return "Usually higher is stronger";
  return "Interpret with trend, peers, and earnings";
}

function trendSummary(detail: TickerDetail) {
  const ma20 = technicalValue(detail.technicals, "20D MA");
  const ma50 = technicalValue(detail.technicals, "50D MA");
  const ma200 = technicalValue(detail.technicals, "200D MA");
  if (ma20 === "Unavailable" && ma50 === "Unavailable" && ma200 === "Unavailable") {
    return "Trend data is limited because moving averages are unavailable.";
  }
  return `Trend check: 20D MA ${ma20}, 50D MA ${ma50}, 200D MA ${ma200}`;
}

function trendDirectionSummary(detail: TickerDetail) {
  const maSignals = detail.technicals.filter((item) => item.label.includes("MA")).map((item) => item.signal.toLowerCase());
  if (!maSignals.length) return "Trend data is limited right now.";
  const belowCount = maSignals.filter((signal) => signal.includes("below")).length;
  if (belowCount >= 2) return "The stock is below key short- and medium-term trend levels, which can mean momentum is weak.";
  if (belowCount === 1) return "Trend signals are mixed across short- and medium-term levels.";
  return "The stock is holding above key trend levels, which supports a stronger setup.";
}

function momentumSummary(detail: TickerDetail) {
  const rsiValue = technicalValue(detail.technicals, "RSI");
  const rsi = parseFirstNumber(rsiValue);
  if (rsi === null) return "Momentum data is limited right now.";
  if (rsi > 70) return "Momentum looks hot right now. RSI is above 70, which can mean the move is stretched.";
  if (rsi < 30) return "Momentum looks weak right now. RSI is below 30, which can happen during heavy selling.";
  return "Momentum looks neutral right now. RSI is a momentum gauge, and around 50 is neutral.";
}

function trendRiskLine(detail: TickerDetail) {
  const signal = detail.technicals
    .filter((item) => item.label.includes("MA"))
    .map((item) => item.signal)
    .join("; ");
  return signal ? `Trend signals: ${signal}.` : "Trend signals are unavailable, which makes timing less clear.";
}

function ratingsSummary(ratings: NormalizedRatings) {
  if (!ratings || ratings.status === "unavailable" || ratings.status === "error") {
    return {
      positive: "Analyst rating data is unavailable, so conviction is lower.",
      risk: "Without ratings coverage, sentiment shifts may be missed."
    };
  }
  return {
    positive: ratings.consensus?.consensusLabel ? `Ratings consensus is ${ratings.consensus.consensusLabel}.` : "Some analyst activity is available.",
    risk: ratings.recentActions?.some((item) => `${item.action ?? ""} ${item.rating ?? ""}`.toLowerCase().includes("downgrade"))
      ? "Recent downgrade activity can increase near-term volatility."
      : "Analyst opinions can change quickly after earnings or guidance updates."
  };
}

function ratingMoveLine(ratings: NormalizedRatings) {
  if (!ratings || ratings.status === "unavailable" || ratings.status === "error") return "Analyst update data is limited right now.";
  const action = ratings.recentActions?.[0];
  if (!action) return "No major recent analyst action was detected.";
  return `Recent analyst update: ${[action.firm, action.action, action.rating].filter(Boolean).join(" ")}.`;
}

function latestEarningsSummary(detail: TickerDetail) {
  if (!detail.earnings.length) return "Earnings data is unavailable, so business momentum is harder to confirm.";
  const latest = detail.earnings[0];
  return `Latest earnings update: ${latest.quarter}, revenue ${latest.revenue}, EPS ${latest.eps}, surprise ${latest.surprise}.`;
}

function newsSummaryLine(news: RelatedNews[]) {
  if (!news.length) {
    return "There is no clear company-specific news explaining the move. This may be related to broader market or sector movement.";
  }
  const latest = news[0];
  return `Latest company-specific headline: ${latest.headline} (${latest.source}).`;
}

function peerDirectionSummary(detail: TickerDetail) {
  if (!detail.peers.length) {
    return {
      good: "Peer comparison data is unavailable, so relative strength is unclear.",
      risk: "Without peer data, it is harder to tell if this move is company-specific or sector-wide."
    };
  }

  const rising = detail.peers.filter((peer) => peer.change > 0).length;
  const total = detail.peers.length;
  if (rising >= Math.ceil(total / 2)) {
    return {
      good: `Most peers are green today (${rising} of ${total}), which can support the setup if leadership continues.`,
      risk: "If peers roll over together, this stock may face group pressure."
    };
  }

  return {
    good: `Only ${rising} of ${total} peers are green today, so stock-specific strength matters more here.`,
    risk: "Broader peer weakness can pull even strong companies lower in the short term."
  };
}

function technicalValue(technicals: TechnicalIndicator[], labelIncludes: string) {
  return technicals.find((item) => item.label.toLowerCase().includes(labelIncludes.toLowerCase()))?.value ?? "Unavailable";
}

function volumeSummary(relativeVolume: string) {
  const numeric = parseFirstNumber(relativeVolume);
  if (numeric === null) return "activity data is unavailable";
  if (numeric >= 1.2) return "heavier than usual";
  if (numeric < 0.9) return "lighter than usual";
  return "around normal";
}

function peerMoveLine(detail: TickerDetail) {
  if (!detail.peers.length) return "Peer movement data is limited right now.";
  const rising = detail.peers.filter((peer) => peer.change > 0).length;
  return `Peer group check: ${rising} of ${detail.peers.length} peers are up today.`;
}

function simpleSetupLabel(detail: TickerDetail) {
  if (detail.opportunityAnalysis.label === "Limited data" || detail.opportunityAnalysis.score === null) return "Not enough data";
  const score = detail.opportunityAnalysis.score;
  if (score >= 75) return "Looks strong";
  if (score >= 62) return "Worth watching";
  if (score >= 50) return "Mixed";
  return "Higher risk";
}

function findFundamental(rows: Fundamental[], metric: string) {
  return rows.find((row) => row.metric === metric)?.value;
}

function formatChangeMagnitude(change: number) {
  return `${change > 0 ? "+" : ""}${change.toFixed(2)}%`;
}

function parseFirstNumber(value: string) {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function ResearchCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-terminal-line bg-terminal-panel2 p-3">
      <div className="text-xs text-terminal-muted">{label}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
      {detail ? <div className="mt-2 text-xs leading-5 text-terminal-muted">{detail}</div> : null}
    </div>
  );
}

function ETFDetails({ profile }: { profile: ETFProfile }) {
  return (
    <Panel title="ETF Details">
      <div className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <ResearchCard label="Expense Ratio" value={profile.expenseRatio} detail="Provider fund cost" />
          <ResearchCard label="AUM" value={profile.aum} detail="Provider assets under management" />
          <ResearchCard label="Holdings Count" value={profile.holdingsCount} detail="Provider holdings basket" />
          <ResearchCard label="Dividend Yield" value={profile.dividendYield} detail="Provider distribution yield" />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-terminal-line bg-terminal-panel2 p-3">
            <div className="font-mono text-xs uppercase tracking-[0.12em] text-terminal-muted">Top Holdings</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {profile.topHoldings.map((symbol) => (
                <TickerLink key={symbol} symbol={symbol} />
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-terminal-line bg-terminal-panel2 p-3">
            <div className="font-mono text-xs uppercase tracking-[0.12em] text-terminal-muted">Sector Exposure</div>
            <div className="mt-2 grid gap-2">
              {profile.sectorExposure.map((item) => (
                <div key={item.label} className="grid grid-cols-[96px_1fr_42px] items-center gap-2 text-xs">
                  <span className="text-terminal-muted">{item.label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
                    <span className="block h-full rounded-full bg-terminal-cyan" style={{ width: `${item.value}%` }} />
                  </span>
                  <span className="text-right font-mono">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function FuturesDetails({ profile }: { profile: FutureProfile }) {
  const rows = [
    { label: "Contract", value: profile.name },
    { label: "Category", value: profile.category },
    { label: "Exchange", value: profile.exchange },
    { label: "Contract Month", value: profile.contractMonth },
    { label: "Tick Size", value: profile.tickSize },
    { label: "Tick Value", value: profile.tickValue },
    { label: "Point Value", value: profile.pointValue },
    { label: "Open Interest", value: profile.openInterest }
  ];

  return (
    <Panel title="Futures Contract Details">
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <ResearchCard key={row.label} label={row.label} value={row.value} detail="Provider futures contract data" />
        ))}
      </div>
    </Panel>
  );
}

function OpportunityAnalysis({ analysis }: { analysis: OpportunityScoreResult }) {
  return (
    <Panel title="Setup Analysis" action={<span className="text-xs text-terminal-muted">Research signal only. Not financial advice.</span>}>
      <div className="grid gap-4 xl:grid-cols-[220px_1fr]">
        <div className="rounded-xl border border-terminal-line bg-terminal-panel2 p-4">
          <div className="font-mono text-xs uppercase tracking-[0.12em] text-terminal-muted">Setup Score</div>
          <div className="mt-3 text-4xl font-semibold tracking-tight text-terminal-cyan">
            {analysis.score === null ? "Limited data" : `${analysis.score}/100`}
          </div>
          <div className="mt-3">
            <SetupPill label={analysis.label} />
          </div>
          <div className="mt-4 font-mono text-xs text-terminal-muted">
            Data coverage: {analysis.dataCoverage.available} of {analysis.dataCoverage.total} signals available
          </div>
          <p className="mt-4 text-xs leading-5 text-terminal-muted">
            Research signal only. This is not a price prediction or financial advice.
          </p>
        </div>

        <div className="grid gap-3">
          {analysis.isUnavailable ? (
            <div className="rounded-xl border border-terminal-amber/20 bg-terminal-panel2 p-4">
              <div className="text-sm font-semibold text-terminal-amber">Setup Analysis unavailable</div>
              <p className="mt-2 text-sm leading-6 text-terminal-muted">{analysis.unavailableReason}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <SignalList title="Available data" items={analysis.availableSignals} fallback="No reliable setup signals available." />
                <SignalList title="Unavailable" items={analysis.unavailableSignals} fallback="No unavailable signals reported." />
              </div>
            </div>
          ) : null}

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {analysis.signalScores.map((signal) => (
              <SignalCard key={signal.label} signal={signal} />
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function SignalCard({ signal }: { signal: OpportunityScoreResult["signalScores"][number] }) {
  const available = signal.status === "available" || signal.status === "partial";
  const statusLabel = signal.status === "partial" ? "Partial" : available ? "Available" : "Unavailable";
  const explain = explainSetupSignal(signal);
  return (
    <div className="rounded-xl border border-terminal-line bg-terminal-panel2 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-xs uppercase tracking-[0.12em] text-terminal-muted">{signal.label}</div>
        <span className={available ? "font-mono text-xs text-terminal-green" : "font-mono text-xs text-terminal-muted"}>
          {statusLabel}
        </span>
      </div>
      <div className="mt-2 text-lg font-semibold text-terminal-text">{signal.score === null ? "-" : `${signal.score}/100`}</div>
      <div className="mt-2 text-[11px] text-terminal-muted">Simple label: {explain.simpleLabel}</div>
      <p className="mt-2 text-xs leading-5 text-terminal-muted"><span className="text-terminal-text">What this means:</span> {explain.whatItMeans}</p>
      <p className="mt-2 text-xs leading-5 text-terminal-muted"><span className="text-terminal-text">Why it matters:</span> {explain.whyItMatters}</p>
      <p className="mt-2 text-xs leading-5 text-terminal-muted"><span className="text-terminal-text">What would improve it:</span> {explain.whatImproves}</p>
      {signal.label === "Ratings" ? <RatingsSignalDetails ratings={signal.ratings} /> : null}
    </div>
  );
}

function explainSetupSignal(signal: OpportunityScoreResult["signalScores"][number]) {
  const plainDetail = simplifySetupDetail(signal);
  const score = signal.score;
  const strong = typeof score === "number" && score >= 70;
  const mixed = typeof score === "number" && score >= 50 && score < 70;

  if (signal.status === "unavailable" || score === null) {
    return {
      simpleLabel: "Limited data",
      whatItMeans: plainDetail,
      whyItMatters: "When this signal is missing, confidence is lower.",
      whatImproves: "Wait for fresh provider data for this signal before making decisions."
    };
  }

  if (signal.label === "Trend") {
    return {
      simpleLabel: strong ? "Trend looks stronger" : mixed ? "Trend looks mixed" : "Trend looks weak",
      whatItMeans: plainDetail,
      whyItMatters: "Trend helps show whether price strength is building or fading.",
      whatImproves: "Price reclaiming and holding above short- and medium-term trend levels with stable activity."
    };
  }

  if (signal.label === "Momentum") {
    return {
      simpleLabel: strong ? "Momentum is supportive" : mixed ? "Momentum is neutral" : "Momentum is soft",
      whatItMeans: plainDetail,
      whyItMatters: "Momentum helps explain if buyers or sellers are currently in control.",
      whatImproves: "RSI stabilizing in healthy ranges and short-term performance improving."
    };
  }

  if (signal.label === "Volume") {
    return {
      simpleLabel: strong ? "Participation looks strong" : mixed ? "Participation is normal" : "Participation looks weak",
      whatItMeans: plainDetail,
      whyItMatters: "Big moves with weak volume can fail faster than moves supported by stronger volume.",
      whatImproves: "Higher relative volume on up moves and lighter volume on pullbacks."
    };
  }

  if (signal.label === "Valuation") {
    return {
      simpleLabel: strong ? "Valuation looks more reasonable" : mixed ? "Valuation looks balanced" : "Valuation looks expensive",
      whatItMeans: plainDetail,
      whyItMatters: "If valuation is too stretched, the stock may need very strong growth to justify the price.",
      whatImproves: "Either better earnings growth or a more reasonable entry valuation."
    };
  }

  if (signal.label === "Growth/Fundamentals") {
    return {
      simpleLabel: strong ? "Business quality looks strong" : mixed ? "Business quality looks mixed" : "Business quality looks weak",
      whatItMeans: plainDetail,
      whyItMatters: "Long-term returns are often tied to real business results, not only short-term price action.",
      whatImproves: "Stronger revenue, EPS, margins, and cash-flow trends in future reports."
    };
  }

  if (signal.label === "News/Sentiment") {
    return {
      simpleLabel: strong ? "News flow is supportive" : mixed ? "News flow is mixed" : "News flow is thin or negative",
      whatItMeans: plainDetail,
      whyItMatters: "Without clear company-specific news, price moves may be mostly market or sector driven.",
      whatImproves: "Consistent positive company-specific updates with clear business impact."
    };
  }

  if (signal.label === "Ratings") {
    return {
      simpleLabel: strong ? "Analyst view is constructive" : mixed ? "Analyst view is mixed" : "Analyst view is cautious",
      whatItMeans: plainDetail,
      whyItMatters: "Shifts in consensus or price targets can move sentiment quickly.",
      whatImproves: "Upgrades, stronger consensus, and better earnings execution."
    };
  }

  if (signal.label === "Risk") {
    return {
      simpleLabel: strong ? "Risk looks more controlled" : mixed ? "Risk looks moderate" : "Risk looks elevated",
      whatItMeans: plainDetail,
      whyItMatters: "Higher volatility can make outcomes less predictable.",
      whatImproves: "Lower volatility, steadier trend structure, and cleaner earnings/news follow-through."
    };
  }

  return {
    simpleLabel: strong ? "Signal looks stronger" : mixed ? "Signal looks mixed" : "Signal looks weak",
    whatItMeans: plainDetail,
    whyItMatters: "This signal adds context beyond price-only movement.",
    whatImproves: "Wait for stronger confirmation from trend, earnings, and news."
  };
}

function simplifySetupDetail(signal: OpportunityScoreResult["signalScores"][number]) {
  const detail = signal.detail;

  if (signal.label === "Trend") {
    const normalized = detail
      .replace(/20D/g, "short-term")
      .replace(/50D/g, "medium-term")
      .replace(/200D/g, "long-term")
      .replace("available moving averages", "trend levels");
    return `${normalized} This shows whether trend direction is improving or weakening.`;
  }

  if (signal.label === "Momentum") {
    const rsiMatch = detail.match(/RSI is\s*(-?\d+(?:\.\d+)?)/i);
    const rsi = rsiMatch ? Number(rsiMatch[1]) : null;
    const rsiText = rsi === null
      ? "Momentum read is limited."
      : rsi > 70
        ? `RSI is ${rsi.toFixed(1)}, which is high and can mean momentum is stretched.`
        : rsi < 30
          ? `RSI is ${rsi.toFixed(1)}, which is low and can mean heavy selling pressure.`
          : `RSI is ${rsi.toFixed(1)}. RSI is a momentum gauge, and around 50 is neutral.`;
    return `${rsiText} Short-term and medium-term performance also feed this score.`;
  }

  if (signal.label === "Volume") {
    const match = detail.match(/Relative volume is\s*(-?\d+(?:\.\d+)?)x/i);
    const volume = match ? Number(match[1]) : null;
    const state = volume === null ? "activity data is limited" : volume >= 1.2 ? "heavier than usual" : volume < 0.9 ? "lighter than usual" : "around normal";
    return `Trading activity is ${state}. This helps show whether moves have broad participation.`;
  }

  if (signal.label === "Valuation") {
    return detail.includes("ratio")
      ? "Valuation ratios are available. This score compares price levels with business results to see if valuation looks stretched or reasonable."
      : "Valuation data is limited right now.";
  }

  if (signal.label === "News/Sentiment") {
    const countMatch = detail.match(/(\d+)\s+recent article/i);
    const count = countMatch ? Number(countMatch[1]) : null;
    return count === null
      ? "News flow is limited right now."
      : `There are ${count} recent company-specific article${count === 1 ? "" : "s"}. News flow can drive short-term moves.`;
  }

  if (signal.label === "Ratings") {
    return detail
      .replace(/Consensus:/gi, "Analyst consensus:")
      .replace(/recent analyst action/gi, "recent analyst update");
  }

  if (signal.label === "Risk") {
    return detail.replace("provider day range", "recent day range");
  }

  return detail;
}

function RatingsSignalDetails({ ratings }: { ratings?: NormalizedRatings }) {
  if (!ratings || ratings.status === "unavailable" || ratings.status === "error") {
    return (
      <div className="mt-3 rounded-md border border-terminal-line bg-terminal-panel p-2 text-xs leading-5 text-terminal-muted">
        Ratings unavailable. Not enough real analyst rating data from configured providers.
      </div>
    );
  }

  const consensusCounts = ratings.consensus ? formatConsensusCounts(ratings.consensus) : null;
  const recentAction = ratings.recentActions?.[0];
  const ratingNews = ratings.ratingNews?.slice(0, 3) ?? [];

  return (
    <div className="mt-3 space-y-2 text-xs leading-5 text-terminal-muted">
      {ratings.consensus?.consensusLabel ? (
        <div><span className="text-terminal-text">Consensus:</span> {ratings.consensus.consensusLabel}</div>
      ) : null}
      {consensusCounts ? (
        <div><span className="text-terminal-text">Buy/Hold/Sell:</span> {consensusCounts}</div>
      ) : null}
      {ratings.priceTarget?.average ? (
        <div><span className="text-terminal-text">Avg target:</span> {formatMoney(ratings.priceTarget.average, ratings.priceTarget.currency)}</div>
      ) : null}
      {recentAction ? (
        <div>
          <span className="text-terminal-text">Recent action:</span>{" "}
          {[recentAction.firm, recentAction.action, recentAction.rating].filter(Boolean).join(" ")}
        </div>
      ) : null}
      {ratingNews.length && !ratings.consensus ? (
        <div>
          <div className="text-terminal-text">Analyst news detected</div>
          <ul className="mt-1 space-y-1">
            {ratingNews.map((item) => (
              <li key={`${item.url}-${item.title}`}>- {item.title}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function formatConsensusCounts(consensus: NonNullable<NormalizedRatings["consensus"]>) {
  const buy = (consensus.strongBuy ?? 0) + (consensus.buy ?? 0);
  const hold = consensus.hold ?? 0;
  const sell = (consensus.sell ?? 0) + (consensus.strongSell ?? 0);
  return buy || hold || sell ? `${buy} / ${hold} / ${sell}` : null;
}

function formatMoney(value: number, currency?: string | null) {
  const prefix = currency && currency !== "USD" ? `${currency} ` : "$";
  return `${prefix}${value.toFixed(2)}`;
}

function SignalList({ title, items, fallback }: { title: string; items: string[]; fallback: string }) {
  return (
    <div>
      <div className="font-mono text-xs uppercase tracking-[0.12em] text-terminal-muted">{title}</div>
      <ul className="mt-2 space-y-1">
        {(items.length ? items : [fallback]).map((item) => (
          <li key={item} className="text-sm text-terminal-text">
            <span className="mr-2 text-terminal-cyan">-</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BulletBlock({ title, items, columns = false }: { title: string; items: string[]; columns?: boolean }) {
  return (
    <div className="rounded-xl border border-terminal-line bg-terminal-panel2 p-3">
      <div className="font-mono text-xs uppercase tracking-[0.12em] text-terminal-muted">{title}</div>
      <ul className={columns ? "mt-3 grid gap-2 md:grid-cols-2" : "mt-3 space-y-2"}>
        {items.map((item) => (
          <li key={item} className="text-sm leading-6 text-terminal-text">
            <span className="mr-2 text-terminal-cyan">-</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SetupPill({ label }: { label: OpportunityScoreResult["label"] }) {
  const tone =
    label === "Strong setup" || label === "Constructive setup"
      ? "border-terminal-green/25 text-terminal-green"
      : label === "Mixed setup"
        ? "border-terminal-cyan/25 text-terminal-cyan"
        : label === "Poor setup" || label === "Weak setup"
          ? "border-terminal-red/25 text-terminal-red"
          : "border-terminal-amber/25 text-terminal-amber";

  return <span className={`inline-flex rounded-md border px-2.5 py-1 font-mono text-xs ${tone}`}>{label}</span>;
}

function TickerList({ symbols }: { symbols: string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-x-1.5 gap-y-1">
      {symbols.map((symbol, index) => (
        <span key={`${symbol}-${index}`} className="inline-flex items-center gap-1">
          <TickerLink symbol={symbol} />
          {index < symbols.length - 1 ? <span className="text-terminal-muted">,</span> : null}
        </span>
      ))}
    </span>
  );
}
