import { DataTable, type Column } from "@/components/DataTable";
import { AIInsight } from "@/components/AIInsight";
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
import { fetchTickerNews, generateSourceGroundedAnalysis } from "@/lib/research-engine";
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
  context: string;
};

type Earnings = {
  quarter: string;
  revenue: string;
  eps: string;
  surprise: string;
  guide: string;
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
};

const fundamentalColumns: Column<Fundamental>[] = [
  { key: "metric", header: "Metric", render: (row) => <span className="text-terminal-cyan">{row.metric}</span> },
  { key: "value", header: "Value", align: "right", render: (row) => row.value },
  { key: "context", header: "Context", render: (row) => row.context }
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
  const [quotePayload, profilePayload, historyPayload, newsPayload, technicalPayload, fundamentalsPayload, earningsPayload, peers] = await Promise.all([
    fetchRealQuote(symbol),
    fetchRealProfile(symbol),
    fetchRealHistory(symbol),
    fetchRealTickerNews(symbol),
    fetchRealTechnicals(symbol),
    fetchRealFundamentals(symbol),
    fetchRealEarnings(symbol),
    fetchRealPeers(symbol)
  ]);
  const ratingsPayload = await fetchRatingsSignal(symbol, newsPayload.data ?? []);
  const detail = buildTickerDetail(symbol, {
    quote: quotePayload.data,
    profile: profilePayload.data,
    candles: historyPayload.data?.candles ?? [],
    news: newsPayload.data ?? [],
    technicals: technicalPayload.data ?? [],
    fundamentals: fundamentalsPayload.data ?? [],
    earnings: earningsPayload.data ?? [],
    ratings: ratingsPayload.data,
    ratingsMeta: ratingsPayload.meta,
    peers
  });

  if (!detail) {
    return (
      <TerminalShell active="" title="Ticker not found" subtitle="The requested symbol could not be resolved.">
        <Panel title="Ticker not found">
          <div className="rounded-lg border border-white/10 bg-white/[0.045] p-6 text-sm text-terminal-muted">Ticker not found</div>
        </Panel>
      </TerminalShell>
    );
  }

  return (
    <TerminalShell
      active=""
      title={`${detail.symbol} Research`}
      subtitle="Price chart, key stats, setup analysis, earnings, latest news, peer comparison, and AI insight."
    >
      <div className="grid gap-3">
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
            <MetricCard label="Daily Change" value={formatChange(detail.change)} detail="Provider quote" />
            <MetricCard label="Volume" value={detail.volume} detail="Provider tape" />
            <MetricCard label={detail.assetType === "future" ? "Exchange" : detail.assetType === "ETF" ? "AUM" : "Market Cap"} value={detail.marketCap} detail={`${formatAssetType(detail.assetType)} / Provider profile`} />
          </div>
        </Panel>

        {detail.unavailableFields.length ? (
          <Panel title="Some data unavailable">
            <div className="rounded-lg border border-terminal-amber/20 bg-white/[0.045] p-4 text-sm text-terminal-amber">
              Data unavailable from configured providers: {detail.unavailableFields.join(", ")}.
            </div>
          </Panel>
        ) : null}

        <div className="grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
          <InteractivePriceChart
            title={`${detail.symbol} Price Chart`}
            symbol={detail.symbol}
            candlesByTimeframe={detail.chart}
            currentPrice={detail.price}
          />

          <Panel title="Key Stats">
            <div className="grid gap-2 sm:grid-cols-2">
              {buildKeyStats(detail).map((stat) => (
                <ResearchCard key={stat.label} label={stat.label} value={stat.value} detail={stat.detail} />
              ))}
            </div>
          </Panel>
        </div>

        <div className="grid gap-3 xl:grid-cols-[0.8fr_1.2fr]">
          <Panel title="Technical Indicators">
            <div className="grid gap-2 sm:grid-cols-2">
              {detail.technicals.map((indicator) => (
                <ResearchCard key={indicator.label} label={indicator.label} value={indicator.value} detail={indicator.signal} />
              ))}
            </div>
          </Panel>

          {detail.assetType === "future" && detail.futureProfile ? <FuturesDetails profile={detail.futureProfile} /> : detail.assetType === "ETF" && detail.etfProfile ? <ETFDetails profile={detail.etfProfile} /> : (
            <Panel title="Fundamentals">
              <DataTable columns={fundamentalColumns} rows={detail.fundamentals} />
            </Panel>
          )}
        </div>

        <OpportunityAnalysis analysis={detail.opportunityAnalysis} />

        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title="Earnings Info">
            <DataTable columns={earningsColumns} rows={detail.earnings} />
          </Panel>

          <Panel title="Latest News">
            <div className="grid gap-2">
              {detail.news.map((item) => (
                <article key={`${item.time}-${item.headline}`} className="rounded-lg border border-white/10 bg-white/[0.045] p-3">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-terminal-muted">
                    <SimpleLocalTime value={item.time} timestampValid={item.timestampValid} />
                    <span aria-hidden="true">·</span>
                    <span>{item.source}</span>
                  </div>
                  <h3 className="mt-2 text-[0.95rem] font-semibold leading-5 tracking-[-0.01em] text-terminal-text">{item.headline}</h3>
                  {item.snippet ? <p className="mt-2 text-xs leading-5 text-terminal-muted">{item.snippet}</p> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-xs">
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
          <DataTable
            columns={[
              { key: "symbol", header: "Ticker", render: (row: Ticker) => <TickerLink symbol={row.symbol} /> },
              { key: "name", header: "Name", render: (row: Ticker) => row.name },
              { key: "price", header: "Price", align: "right", render: (row: Ticker) => row.price > 0 ? `$${row.price.toFixed(2)}` : "Unavailable" },
              { key: "change", header: "Daily %", align: "right", render: (row: Ticker) => formatChange(row.change) },
              { key: "size", header: detail.assetType === "ETF" ? "AUM" : "Market Cap", align: "right", render: (row: Ticker) => peerOverviewValue(row.symbol, detail.assetType === "ETF" ? "marketCap" : "marketCap") },
              { key: "valuation", header: detail.assetType === "ETF" ? "Expense Ratio" : detail.assetType === "future" ? "Exchange" : "P/E", align: "right", render: (row: Ticker) => peerOverviewValue(row.symbol, detail.assetType === "ETF" ? "expenseRatio" : detail.assetType === "future" ? "exchange" : "pe") },
              { key: "growth", header: detail.assetType === "ETF" ? "Dividend Yield" : detail.assetType === "future" ? "Category" : "Revenue Growth", align: "right", render: (row: Ticker) => peerOverviewValue(row.symbol, detail.assetType === "ETF" ? "dividendYield" : detail.assetType === "future" ? "category" : "revenueGrowth") }
            ]}
            rows={detail.peers}
          />
        </Panel>

        <AIInsight
          title={`${detail.symbol} AI Insight`}
          analysis={generateSourceGroundedAnalysis({
            id: `ticker-${detail.symbol}`,
            title: `${detail.symbol} Source-Grounded Research`,
            topic: `${detail.name} price action, fundamentals, earnings, latest news, analyst target range, risk score, catalysts, and research verdict`,
            sources: fetchTickerNews(detail.symbol),
            missingData: detail.unavailableFields.length ? detail.unavailableFields : ["Real-time intraday tape", "Full analyst reports", "Options positioning"],
            confidence: detail.unavailableFields.length ? "Low" : "Medium",
            dataCompleteness: detail.unavailableFields.length ? 58 : 82
          })}
        />

      </div>
    </TerminalShell>
  );
}

function buildTickerDetail(
  symbol: string,
  providerData: {
    quote: Awaited<ReturnType<typeof fetchRealQuote>>["data"];
    profile: Awaited<ReturnType<typeof fetchRealProfile>>["data"];
    candles: OhlcvCandle[];
    news: NormalizedNewsArticle[];
    technicals: TechnicalIndicator[];
    fundamentals: Fundamental[];
    earnings: Earnings[];
    ratings: NormalizedRatings;
    ratingsMeta: RatingsMeta;
    peers: Ticker[];
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
  const revenueGrowth = "Unavailable";
  const epsGrowth = "Unavailable";
  const volume = providerData.quote?.volume ? providerData.quote.volume.toLocaleString() : "Unavailable";
  const marketCap = providerData.quote?.marketCap ?? providerData.profile?.marketCap;
  const pe = fundamentalValue(providerData.fundamentals, "P/E");
  const analystTargetRange = "Data unavailable";
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
    candles: providerData.candles,
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
    debtEquity: "Unavailable",
    averageVolume: "Unavailable",
    chart: buildChart(providerData.candles),
    keyStats: [
      { label: "Sector", value: sector, detail: "Provider classification" },
      { label: "Relative Volume", value: relativeVolumeValue(providerData.technicals), detail: "Versus available average volume" },
      ...(overview.assetType === "ETF" && overview.etfProfile
        ? [
            { label: "Expense Ratio", value: overview.etfProfile.expenseRatio, detail: "Provider ETF profile" },
            { label: "Holdings", value: overview.etfProfile.holdingsCount, detail: "Provider basket count" }
          ]
        : [{ label: "Analyst Target Range", value: analystTargetRange, detail: "Bear / base / bull" }])
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
      ...(!providerData.candles.length ? ["chart history"] : []),
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
    peers: providerData.peers
  };
}

async function fetchRealPeers(symbol: string): Promise<Ticker[]> {
  const peers = fetchPeers(symbol);
  const quotes = await Promise.all(peers.map((peer) => fetchRealQuote(peer.symbol)));

  return peers.map((peer, index) => {
    const quote = quotes[index].data;
    return {
      ...peer,
      name: quote?.name ?? peer.name,
      price: quote?.price ?? 0,
      change: quote?.changePercent ?? 0,
      volume: quote?.volume ? quote.volume.toLocaleString() : "Unavailable",
      marketCap: quote?.marketCap ? formatLargeNumber(quote.marketCap) : "Unavailable"
    };
  });
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

function buildChart(candles: OhlcvCandle[]) {
  if (!candles.length) return buildEmptyCandleSet();
  return {
    "1D": candles.slice(-1),
    "5D": candles.slice(-5),
    "1Mo": candles.slice(-22),
    "3Mo": candles.slice(-66),
    "6Mo": candles.slice(-132),
    YTD: candles.filter((candle) => new Date(candle.time).getUTCFullYear() === new Date().getUTCFullYear()),
    "1Y": candles.slice(-252),
    "5Y": candles,
    "1m": candles,
    "5m": candles,
    "15m": candles,
    "30m": candles,
    "1h": candles,
    "4h": candles
  };
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
      { label: "Contract Name", value: detail.futureProfile.name, detail: "Provider futures profile" },
      { label: "Asset Type", value: "Future", detail: detail.futureProfile.category },
      { label: "Session High", value: detail.futureProfile.sessionHigh, detail: "Current provider session" },
      { label: "Session Low", value: detail.futureProfile.sessionLow, detail: "Current provider session" },
      { label: "Open Interest", value: detail.futureProfile.openInterest, detail: "Provider contract interest" },
      { label: "Contract Month", value: detail.futureProfile.contractMonth, detail: "Front/reference contract" },
      { label: "Tick Size", value: detail.futureProfile.tickSize, detail: "Minimum price increment" },
      { label: "Tick Value", value: detail.futureProfile.tickValue, detail: "Value per tick" },
      { label: "Point Value", value: detail.futureProfile.pointValue, detail: "Value per full point" },
      { label: "Exchange", value: detail.futureProfile.exchange, detail: "Trading venue" },
      { label: "Average Volume", value: detail.averageVolume, detail: "Provider liquidity profile" },
      { label: "Relative Volume", value: detail.keyStats.find((stat) => stat.label === "Relative Volume")?.value ?? "-", detail: "Versus 30D avg" }
    ];
  }

  return [
    { label: "P/E", value: detail.pe, detail: detail.assetType === "ETF" ? "Not applicable" : "Blended estimate" },
    { label: "Forward P/E", value: detail.forwardPe, detail: detail.assetType === "ETF" ? "Not applicable" : "Provider forward estimate" },
    { label: "Revenue Growth", value: detail.revenueGrowth, detail: "Provider growth profile" },
    { label: "EPS Growth", value: detail.epsGrowth, detail: "Provider earnings profile" },
    { label: "Gross Margin", value: detail.grossMargin, detail: "Provider margin profile" },
    { label: "Debt/Equity", value: detail.debtEquity, detail: "Balance sheet input" },
    { label: "52-Week Range", value: detail.weekRange, detail: "Provider range" },
    { label: "Average Volume", value: detail.averageVolume, detail: "Provider liquidity profile" },
    ...detail.keyStats
  ];
}

function peerOverviewValue(symbol: string, field: "marketCap" | "pe" | "revenueGrowth" | "expenseRatio" | "dividendYield" | "exchange" | "category") {
  const overview = fetchTickerOverview(symbol);

  if (field === "expenseRatio") {
    return overview.assetType === "ETF" ? overview.etfProfile.expenseRatio : "N/A";
  }

  if (field === "dividendYield") {
    return overview.assetType === "ETF" ? overview.etfProfile.dividendYield : "N/A";
  }

  if (field === "revenueGrowth") {
    return overview.assetType === "future" ? "N/A" : `${overview.revenueGrowth}%`;
  }

  if (field === "exchange") {
    return overview.assetType === "future" ? overview.futureProfile.exchange : "N/A";
  }

  if (field === "category") {
    return overview.assetType === "future" ? overview.futureProfile.category : "N/A";
  }

  if (field === "marketCap") {
    return overview.assetType === "future" ? overview.exchange : overview.marketCap;
  }

  if (field === "pe") {
    return overview.assetType === "future" ? "N/A" : overview.pe;
  }

  return "N/A";
}

function formatAssetType(assetType: AssetType) {
  if (assetType === "future") return "Future";
  if (assetType === "stock") return "Stock";
  return assetType;
}

function ResearchCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.045] p-3">
      <div className="font-mono text-xs text-terminal-muted">{label}</div>
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
          <div className="rounded-lg border border-white/10 bg-white/[0.045] p-3">
            <div className="font-mono text-xs uppercase tracking-[0.12em] text-terminal-muted">Top Holdings</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {profile.topHoldings.map((symbol) => (
                <TickerLink key={symbol} symbol={symbol} />
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.045] p-3">
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
    <Panel title="Setup Analysis" action={<span className="font-mono text-xs text-terminal-muted">Research signal only. Not financial advice.</span>}>
      <div className="grid gap-3 xl:grid-cols-[220px_1fr]">
        <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
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
            <div className="rounded-lg border border-terminal-amber/20 bg-white/[0.045] p-4">
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
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <BulletBlock title="Why It Appears Interesting" items={analysis.drivers} />
        <BulletBlock title="Why It May Be Down" items={analysis.whyDown} />
        <BulletBlock title="What Could Help Recovery" items={analysis.recoveryCatalysts} />
        <BulletBlock title="Main Risks" items={analysis.risks} />
      </div>
      <div className="mt-3">
        <BulletBlock title="Catalyst Watch" items={analysis.catalystWatch.length ? analysis.catalystWatch : ["Not enough real data available for this signal."]} columns />
      </div>
    </Panel>
  );
}

function SignalCard({ signal }: { signal: OpportunityScoreResult["signalScores"][number] }) {
  const available = signal.status === "available" || signal.status === "partial";
  const statusLabel = signal.status === "partial" ? "Partial" : available ? "Available" : "Unavailable";
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.045] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-xs uppercase tracking-[0.12em] text-terminal-muted">{signal.label}</div>
        <span className={available ? "font-mono text-xs text-terminal-green" : "font-mono text-xs text-terminal-muted"}>
          {statusLabel}
        </span>
      </div>
      <div className="mt-2 text-lg font-semibold text-terminal-text">{signal.score === null ? "-" : `${signal.score}/100`}</div>
      <p className="mt-2 text-xs leading-5 text-terminal-muted">{signal.detail}</p>
      {signal.label === "Ratings" ? <RatingsSignalDetails ratings={signal.ratings} /> : null}
    </div>
  );
}

function RatingsSignalDetails({ ratings }: { ratings?: NormalizedRatings }) {
  if (!ratings || ratings.status === "unavailable" || ratings.status === "error") {
    return (
      <div className="mt-3 rounded-md border border-white/10 bg-black/10 p-2 text-xs leading-5 text-terminal-muted">
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
    <div className="rounded-lg border border-white/10 bg-white/[0.045] p-3">
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
