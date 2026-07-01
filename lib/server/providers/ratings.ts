import { serverEnv } from "@/lib/server/env";
import type { NormalizedNewsArticle } from "@/lib/provider-gateway";

const CACHE_SECONDS = 300;
const PROVIDER_TIMEOUT_MS = 5000;

export type RatingsSignalStatus = "available" | "partial" | "unavailable" | "error";

export type NormalizedRatings = {
  symbol: string;
  status: RatingsSignalStatus;
  sourceSummary: string[];
  updatedAt: string;
  consensus?: {
    strongBuy?: number | null;
    buy?: number | null;
    hold?: number | null;
    sell?: number | null;
    strongSell?: number | null;
    consensusLabel?: string | null;
  };
  priceTarget?: {
    average?: number | null;
    high?: number | null;
    low?: number | null;
    median?: number | null;
    currency?: string | null;
  };
  recentActions?: Array<{
    date: string;
    firm?: string | null;
    action?: string | null;
    rating?: string | null;
    previousRating?: string | null;
    priceTarget?: number | null;
    previousPriceTarget?: number | null;
    source: string;
  }>;
  ratingNews?: Array<{
    title: string;
    source: string;
    url: string;
    publishedAt: string;
    detectedAction: string;
  }>;
  unavailableReason?: string;
};

type ProviderHealth = {
  provider: string;
  status: "available" | "unavailable" | "error";
  detail?: string;
};

export type RatingsMeta = {
  status: RatingsSignalStatus;
  sourcesUsed: string[];
  consensusAvailable: boolean;
  priceTargetAvailable: boolean;
  recentActionsCount: number;
  ratingNewsCount: number;
  unavailableReason?: string;
  providerHealth: ProviderHealth[];
};

type JsonResult = {
  data: unknown;
  ok: boolean;
  status: number;
  error?: string;
};

export async function fetchRatingsSignal(symbol: string, tickerNews: NormalizedNewsArticle[] = []): Promise<{ data: NormalizedRatings; meta: RatingsMeta }> {
  const normalized = symbol.trim().toUpperCase();
  const updatedAt = new Date().toISOString();
  const providerHealth: ProviderHealth[] = [];
  const sourceSummary: string[] = [];
  const recentActions: NonNullable<NormalizedRatings["recentActions"]> = [];
  const ratingNews: NonNullable<NormalizedRatings["ratingNews"]> = [];
  let consensus: NormalizedRatings["consensus"];
  let priceTarget: NormalizedRatings["priceTarget"];

  if (serverEnv.fmpApiKey) {
    const fmp = await fetchFmpRatings(normalized);
    providerHealth.push(...fmp.health);
    if (fmp.consensus) consensus = mergeConsensus(consensus, fmp.consensus);
    if (fmp.priceTarget) priceTarget = mergePriceTarget(priceTarget, fmp.priceTarget);
    recentActions.push(...fmp.recentActions);
    if (fmp.used) sourceSummary.push("Financial Modeling Prep");
  } else {
    providerHealth.push({ provider: "Financial Modeling Prep", status: "unavailable", detail: "FMP_API_KEY not configured" });
  }

  if (serverEnv.finnhubApiKey) {
    const finnhub = await fetchFinnhubRatings(normalized);
    providerHealth.push(...finnhub.health);
    if (finnhub.consensus) consensus = mergeConsensus(consensus, finnhub.consensus);
    if (finnhub.priceTarget) priceTarget = mergePriceTarget(priceTarget, finnhub.priceTarget);
    if (finnhub.used) sourceSummary.push("Finnhub");
  } else {
    providerHealth.push({ provider: "Finnhub", status: "unavailable", detail: "FINNHUB_API_KEY not configured" });
  }

  const newsResult = detectRatingNews(tickerNews);
  providerHealth.push(newsResult.health);
  ratingNews.push(...newsResult.ratingNews);
  if (newsResult.ratingNews.length) sourceSummary.push("Ticker-specific news");

  const dedupedSources = Array.from(new Set(sourceSummary));
  const hasConsensus = Boolean(consensus && hasConsensusData(consensus));
  const hasPriceTarget = Boolean(priceTarget && hasPriceTargetData(priceTarget));
  const hasActions = recentActions.length > 0;
  const hasNews = ratingNews.length > 0;
  const status: RatingsSignalStatus = hasConsensus || hasPriceTarget || hasActions ? "available" : hasNews ? "partial" : "unavailable";
  const unavailableReason = status === "unavailable" ? "Not enough real analyst rating data from configured providers." : undefined;

  const data: NormalizedRatings = {
    symbol: normalized,
    status,
    sourceSummary: dedupedSources,
    updatedAt,
    consensus: hasConsensus ? consensus : undefined,
    priceTarget: hasPriceTarget ? priceTarget : undefined,
    recentActions: recentActions.slice(0, 5),
    ratingNews: ratingNews.slice(0, 5),
    unavailableReason
  };

  return {
    data,
    meta: {
      status,
      sourcesUsed: dedupedSources,
      consensusAvailable: hasConsensus,
      priceTargetAvailable: hasPriceTarget,
      recentActionsCount: data.recentActions?.length ?? 0,
      ratingNewsCount: data.ratingNews?.length ?? 0,
      unavailableReason,
      providerHealth
    }
  };
}

async function fetchFmpRatings(symbol: string) {
  const health: ProviderHealth[] = [];
  const recentActions: NonNullable<NormalizedRatings["recentActions"]> = [];
  let consensus: NormalizedRatings["consensus"];
  let priceTarget: NormalizedRatings["priceTarget"];

  const endpoints = [
    { label: "FMP analyst estimates", url: `https://financialmodelingprep.com/stable/analyst-estimates?symbol=${encodeURIComponent(symbol)}&period=annual&apikey=${serverEnv.fmpApiKey}` },
    { label: "FMP recommendations", url: `https://financialmodelingprep.com/api/v3/analyst-stock-recommendations/${encodeURIComponent(symbol)}?apikey=${serverEnv.fmpApiKey}` },
    { label: "FMP price target consensus", url: `https://financialmodelingprep.com/api/v4/price-target-consensus?symbol=${encodeURIComponent(symbol)}&apikey=${serverEnv.fmpApiKey}` },
    { label: "FMP upgrades downgrades", url: `https://financialmodelingprep.com/api/v4/upgrades-downgrades?symbol=${encodeURIComponent(symbol)}&apikey=${serverEnv.fmpApiKey}` },
    { label: "FMP stock grades", url: `https://financialmodelingprep.com/api/v3/grade/${encodeURIComponent(symbol)}?apikey=${serverEnv.fmpApiKey}` }
  ];

  const results = await Promise.all(endpoints.map(async (endpoint) => ({ endpoint, json: await fetchJson(endpoint.url) })));

  for (const { endpoint, json } of results) {
    health.push({ provider: endpoint.label, status: json.ok ? "available" : "error", detail: json.error ?? `${json.status}` });
    if (!json.ok) continue;
    const rows = payloadRows(json.data);
    if (!rows.length) continue;

    if (endpoint.label.includes("analyst estimates") || endpoint.label.includes("recommendations")) {
      consensus = mergeConsensus(consensus, consensusFromRows(rows));
    }
    if (endpoint.label.includes("price target")) {
      priceTarget = mergePriceTarget(priceTarget, priceTargetFromRows(rows));
    }
    if (endpoint.label.includes("upgrades") || endpoint.label.includes("grades")) {
      recentActions.push(...rows.map((row) => actionFromRow(row, endpoint.label)).filter(Boolean) as NonNullable<NormalizedRatings["recentActions"]>);
    }
  }

  return {
    health,
    consensus,
    priceTarget,
    recentActions: recentActions.slice(0, 5),
    used: Boolean(hasConsensusData(consensus) || hasPriceTargetData(priceTarget) || recentActions.length)
  };
}

async function fetchFinnhubRatings(symbol: string) {
  const health: ProviderHealth[] = [];
  let consensus: NormalizedRatings["consensus"];
  let priceTarget: NormalizedRatings["priceTarget"];

  const [recommendations, target] = await Promise.all([
    fetchJson(`https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${serverEnv.finnhubApiKey}`),
    fetchJson(`https://finnhub.io/api/v1/stock/price-target?symbol=${encodeURIComponent(symbol)}&token=${serverEnv.finnhubApiKey}`)
  ]);
  health.push({ provider: "Finnhub recommendation trends", status: recommendations.ok ? "available" : "error", detail: recommendations.error ?? `${recommendations.status}` });
  if (recommendations.ok) consensus = consensusFromRows(payloadRows(recommendations.data));

  health.push({ provider: "Finnhub price target", status: target.ok ? "available" : "error", detail: target.error ?? `${target.status}` });
  if (target.ok) priceTarget = priceTargetFromRows(payloadRows(target.data));

  return {
    health,
    consensus,
    priceTarget,
    used: Boolean(hasConsensusData(consensus) || hasPriceTargetData(priceTarget))
  };
}

function detectRatingNews(articles: NormalizedNewsArticle[]) {
  const ratingNews = articles
    .map((article) => ratingNewsFromArticle(article))
    .filter(Boolean) as NonNullable<NormalizedRatings["ratingNews"]>;

  return {
    ratingNews,
    health: {
      provider: "Ticker-specific rating news",
      status: articles.length ? "available" : "unavailable",
      detail: `${ratingNews.length} rating-related headline${ratingNews.length === 1 ? "" : "s"}`
    } satisfies ProviderHealth
  };
}

async function fetchJson(url: string): Promise<JsonResult> {
  try {
    const response = await fetch(url, { next: { revalidate: CACHE_SECONDS }, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) return { data, ok: false, status: response.status, error: providerHttpError(response.status) };
    return { data, ok: true, status: response.status };
  } catch (error) {
    return { data: null, ok: false, status: 0, error: safeError(error) };
  }
}

function payloadRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.map(asRecord);
  const record = asRecord(data);
  if (Array.isArray(record.data)) return record.data.map(asRecord);
  if (Array.isArray(record.historical)) return record.historical.map(asRecord);
  if (Object.keys(record).length) return [record];
  return [];
}

function consensusFromRows(rows: Record<string, unknown>[]): NormalizedRatings["consensus"] {
  const row = rows[0] ?? {};
  const strongBuy = numberFrom(row.strongBuy ?? row.strongbuy ?? row.analystRatingsStrongBuy ?? row.strongBuyCount);
  const buy = numberFrom(row.buy ?? row.analystRatingsbuy ?? row.analystRatingsBuy ?? row.buyCount);
  const hold = numberFrom(row.hold ?? row.analystRatingsHold ?? row.holdCount);
  const sell = numberFrom(row.sell ?? row.analystRatingsSell ?? row.sellCount);
  const strongSell = numberFrom(row.strongSell ?? row.strongsell ?? row.analystRatingsStrongSell ?? row.strongSellCount);
  const consensusLabel = stringFrom(row.consensusLabel ?? row.rating ?? row.recommendation ?? row.grade ?? deriveConsensusLabel({ strongBuy, buy, hold, sell, strongSell }));

  return { strongBuy, buy, hold, sell, strongSell, consensusLabel };
}

function priceTargetFromRows(rows: Record<string, unknown>[]): NormalizedRatings["priceTarget"] {
  const row = rows[0] ?? {};
  return {
    average: numberFrom(row.targetConsensus ?? row.targetMean ?? row.targetMeanPrice ?? row.priceTargetAverage ?? row.average ?? row.target),
    high: numberFrom(row.targetHigh ?? row.targetHighPrice ?? row.high),
    low: numberFrom(row.targetLow ?? row.targetLowPrice ?? row.low),
    median: numberFrom(row.targetMedian ?? row.targetMedianPrice ?? row.median),
    currency: stringFrom(row.currency ?? "USD")
  };
}

function actionFromRow(row: Record<string, unknown>, source: string): NonNullable<NormalizedRatings["recentActions"]>[number] | null {
  const action = stringFrom(row.action ?? row.newGrade ?? row.grade ?? row.rating);
  const rating = stringFrom(row.toGrade ?? row.newGrade ?? row.rating ?? row.grade);
  const previousRating = stringFrom(row.fromGrade ?? row.previousGrade ?? row.previousRating);
  const firm = stringFrom(row.gradingCompany ?? row.analystCompany ?? row.firm ?? row.company);
  const date = stringFrom(row.date ?? row.publishedDate ?? row.createdAt);
  const priceTarget = numberFrom(row.priceTarget ?? row.newPriceTarget ?? row.target);
  const previousPriceTarget = numberFrom(row.previousPriceTarget ?? row.oldPriceTarget);
  if (!action && !rating && !firm) return null;
  return { date: date ?? new Date().toISOString(), firm, action, rating, previousRating, priceTarget, previousPriceTarget, source };
}

function ratingNewsFromArticle(article: NormalizedNewsArticle): NonNullable<NormalizedRatings["ratingNews"]>[number] | null {
  const detectedAction = detectRatingAction(article.headline);
  if (!detectedAction) return null;
  return {
    title: article.headline,
    source: article.sourceName,
    url: article.url,
    publishedAt: article.publishedAt,
    detectedAction
  };
}

export function detectRatingAction(text: string) {
  const normalized = text.toLowerCase();
  const patterns = [
    ["raises price target", "Raises price target"],
    ["raised price target", "Raises price target"],
    ["lowers price target", "Lowers price target"],
    ["lowered price target", "Lowers price target"],
    ["price target", "Price target"],
    ["upgraded", "Upgrade"],
    ["upgrade", "Upgrade"],
    ["downgraded", "Downgrade"],
    ["downgrade", "Downgrade"],
    ["initiates coverage", "Initiates coverage"],
    ["reiterates", "Reiterates"],
    ["maintains", "Maintains"],
    ["overweight", "Overweight"],
    ["outperform", "Outperform"],
    ["underperform", "Underperform"],
    ["neutral", "Neutral"],
    ["buy rating", "Buy rating"],
    ["sell rating", "Sell rating"],
    ["hold rating", "Hold rating"]
  ] as const;
  return patterns.find(([needle]) => normalized.includes(needle))?.[1] ?? null;
}

function mergeConsensus(current: NormalizedRatings["consensus"], next: NormalizedRatings["consensus"]): NormalizedRatings["consensus"] {
  if (!next || !hasConsensusData(next)) return current;
  if (!current || !hasConsensusData(current)) return next;
  return {
    strongBuy: current.strongBuy ?? next.strongBuy,
    buy: current.buy ?? next.buy,
    hold: current.hold ?? next.hold,
    sell: current.sell ?? next.sell,
    strongSell: current.strongSell ?? next.strongSell,
    consensusLabel: current.consensusLabel ?? next.consensusLabel
  };
}

function mergePriceTarget(current: NormalizedRatings["priceTarget"], next: NormalizedRatings["priceTarget"]): NormalizedRatings["priceTarget"] {
  if (!next || !hasPriceTargetData(next)) return current;
  if (!current || !hasPriceTargetData(current)) return next;
  return {
    average: current.average ?? next.average,
    high: current.high ?? next.high,
    low: current.low ?? next.low,
    median: current.median ?? next.median,
    currency: current.currency ?? next.currency
  };
}

function hasConsensusData(consensus: NormalizedRatings["consensus"] | undefined) {
  return Boolean(consensus && [consensus.strongBuy, consensus.buy, consensus.hold, consensus.sell, consensus.strongSell].some((value) => typeof value === "number") || consensus?.consensusLabel);
}

function hasPriceTargetData(priceTarget: NormalizedRatings["priceTarget"] | undefined) {
  return Boolean(priceTarget && [priceTarget.average, priceTarget.high, priceTarget.low, priceTarget.median].some((value) => typeof value === "number"));
}

function deriveConsensusLabel(consensus: NonNullable<NormalizedRatings["consensus"]>) {
  const positive = (consensus.strongBuy ?? 0) + (consensus.buy ?? 0);
  const neutral = consensus.hold ?? 0;
  const negative = (consensus.sell ?? 0) + (consensus.strongSell ?? 0);
  if (!positive && !neutral && !negative) return null;
  if (positive > neutral + negative) return "Buy";
  if (negative > positive + neutral) return "Sell";
  return "Hold";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function numberFrom(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[$,%]/g, "")) : NaN;
  return Number.isFinite(number) ? number : null;
}

function stringFrom(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function providerHttpError(status: number) {
  if (status === 401 || status === 403) return "Provider credentials unavailable or unauthorized.";
  if (status === 429) return "Provider API limit reached.";
  return `Provider request failed with status ${status}.`;
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : "Provider request failed.";
}
