import type { ApiResponseStatus } from "@/lib/api-response";
import { NEWS_TIMEZONE, classifyNewsArticle, formatLocalArticleTime, getLocalDateBucket, getRangeStart, normalizeArticleTimestamp } from "@/lib/news-classification";
import { serverEnv } from "@/lib/server/env";
import { readCachedNews, saveRealNewsToCache } from "@/lib/server/news-cache";
import { fetchNewsApiMarketNews, type RawNewsApiArticle } from "@/lib/server/providers/newsapi";
import { fetchRssMarketNews, type RawRssArticle } from "@/lib/server/providers/rss-news";

const CACHE_SECONDS = 300;
let providerHealthExtras: Record<string, unknown> = {};

export const providerCacheHeaders = {
  "Cache-Control": `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`
};

export type ProviderPayload<T> = {
  data: T | null;
  source: string;
  status: Exclude<ApiResponseStatus, "error">;
  delay: string;
  updatedAt: string;
  error?: string;
  meta?: NewsProviderDebugMeta;
};

export type NewsProviderDebugMeta = {
  liveProviderArticleCount: number;
  cachedArticleCount: number;
  totalArticlesBeforeFiltering: number;
  totalArticlesAfterFiltering: number;
  totalArticlesAfterMerge: number;
  providersUsed: string[];
  providerHealth: Record<string, unknown>;
  providerCounts: Record<string, number>;
  rssSourceHealth?: unknown;
  acceptedCounts: Record<string, number>;
  rejectedCounts: Record<string, number>;
  rejectedReasons: Record<string, number>;
  firstRejectedArticles: Array<{ title: string; source: string; reason: string }>;
  dedupedCount: number;
  bucketCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  newestArticleAt: string | null;
  oldestArticleAt: string | null;
  cacheUsed: boolean;
  tickerIdentity?: TickerIdentity;
  totalFetched?: number;
  totalAfterTickerFilter?: number;
  rejectedAsUnrelatedCount?: number;
  rejectedIncidentalMentionCount?: number;
  rejectedProviderTagWithoutTopicRelevanceCount?: number;
  rejectedTitleAboutOtherCompanyCount?: number;
  rejectedSnippetOnlyUnrelatedTitleCount?: number;
  rejectedWeakMatchBelowThresholdCount?: number;
  acceptedSamples?: Array<{ title: string; source: string; score: number; reasons: string[] }>;
  rejectedSamples?: Array<{ title: string; source: string; score: number; reasons: string[] }>;
};

export type NormalizedQuote = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  marketCap: number | null;
};

export type NormalizedCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type NormalizedHistory = {
  symbol: string;
  candles: NormalizedCandle[];
};

export type HistoryRequest = {
  range?: string;
  interval?: string;
};

export type NewsRequest = {
  range?: string;
  limit?: number;
  query?: string;
  timezone?: string;
};

export type NormalizedProfile = {
  symbol: string;
  name: string;
  companyName: string;
  sector: string;
  industry: string;
  description: string;
  exchange: string;
  currency: string;
  marketCap: number | null;
  website: string;
  image: string;
};

export type NormalizedNewsArticle = {
  id: string;
  headline: string;
  title: string;
  sourceName: string;
  author?: string;
  url: string;
  publishedAt: string;
  publishedLocalTime: string;
  localDateBucket: string;
  primaryCategory: string;
  categories: string[];
  category: string;
  relatedTickers: string[];
  sentiment?: string;
  impactLevel?: string;
  snippet: string;
  provider?: string;
  cached?: boolean;
  firstSeenAt?: string;
  lastSeenAt?: string;
  originalProvider?: string;
  timestampValid?: boolean;
  timestampSource?: string;
  timestampWarning?: string;
  tickerMatchScore?: number;
  tickerMatchReasons?: string[];
};

export type TickerIdentity = {
  symbol: string;
  normalizedSymbol: string;
  companyName: string;
  shortName: string;
  assetType: string;
  exchange: string;
  sector: string;
  industry: string;
  aliases: string[];
  isEtf: boolean;
  isIndex: boolean;
};

export type TickerArticleMatch = {
  matched: boolean;
  score: number;
  matchedTickers: string[];
  relatedTickers: string[];
  reasons: string[];
};

export type ArticleSubjectDetection = {
  primaryCompanyName: string | null;
  primaryTicker: string | null;
  titleMentionsCompanies: string[];
  titleMentionsPageTicker: boolean;
  titleMentionsOtherCompany: boolean;
  reasons: string[];
};

export type NewsTraceArticle = {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  publishedLocalTime: string;
  matchedFragment: string;
  passedDateFilter: {
    today: boolean;
    sevenDay: boolean;
  };
  passedRelevanceFilter: boolean;
  rejectedReason: string | null;
  dedupeStatus: {
    today: "accepted" | "removed_by_dedupe" | "not_in_range" | "not_relevant" | "not_in_final";
    sevenDay: "accepted" | "removed_by_dedupe" | "not_in_range" | "not_relevant" | "not_in_final";
    duplicateOf?: string;
  };
};

export type NewsTraceProviderResult = {
  sourceName: string;
  provider: string;
  attempted: boolean;
  returnedCount: number;
  status: string;
  error?: string;
  matchedArticles: NewsTraceArticle[];
};

export type NewsTraceReport = {
  fragments: string[];
  providers: NewsTraceProviderResult[];
  lifecycle: {
    today: NewsTraceLifecycle;
    sevenDay: NewsTraceLifecycle;
  };
};

export type NewsTraceLifecycle = {
  range: "today" | "7d";
  totalArticles: number;
  source: string;
  status: string;
  matchedFinalArticles: NewsTraceArticle[];
  meta?: NewsProviderDebugMeta;
};

export type NormalizedMacroSeries = {
  seriesId: string;
  date: string;
  value: number;
  units: string;
  title: string;
};

export type NormalizedFundamental = {
  metric: string;
  value: string;
  context: string;
};

export type NormalizedEarnings = {
  quarter: string;
  revenue: string;
  eps: string;
  surprise: string;
  guide: string;
};

export type NormalizedTechnical = {
  label: string;
  value: string;
  signal: string;
};

type AttemptResult<T> = {
  data: T | null;
  source: string;
  status: Exclude<ApiResponseStatus, "error">;
  delay: string;
  error?: string;
  returnedCount?: number;
  acceptedCount?: number;
  rejectedCount?: number;
};

export async function fetchRealQuote(symbol: string): Promise<ProviderPayload<NormalizedQuote>> {
  const route = `api/quote/${symbol}`;
  const providers: Array<() => Promise<AttemptResult<NormalizedQuote>>> = [
    () => fetchFmpQuote(route, symbol),
    () => fetchFinnhubQuote(route, symbol),
    () => fetchAlphaVantageQuote(route, symbol),
    () => fetchAlpacaQuote(route, symbol)
  ];

  return firstUsable(route, providers);
}

export async function fetchRealHistory(symbol: string, request: HistoryRequest = {}): Promise<ProviderPayload<NormalizedHistory>> {
  const route = `api/history/${symbol}`;
  const normalizedInterval = normalizeInterval(request.interval);
  const intraday = normalizedInterval !== "1day";
  const providers: Array<() => Promise<AttemptResult<NormalizedHistory>>> = intraday
    ? [
        () => fetchAlpacaHistory(route, symbol, request),
        () => fetchTwelveDataHistory(route, symbol, request),
        () => fetchAlphaVantageHistory(route, symbol, request),
        () => fetchFmpHistory(route, symbol, request)
      ]
    : [
        () => fetchFmpHistory(route, symbol, request),
        () => fetchAlphaVantageHistory(route, symbol, request),
        () => fetchTwelveDataHistory(route, symbol, request),
        () => fetchAlpacaHistory(route, symbol, request)
      ];

  return firstUsable(route, providers);
}

export async function fetchRealProfile(symbol: string): Promise<ProviderPayload<NormalizedProfile>> {
  const route = `api/profile/${symbol}`;
  const providers: Array<() => Promise<AttemptResult<NormalizedProfile>>> = [
    () => fetchFmpProfile(route, symbol),
    () => fetchFinnhubProfile(route, symbol)
  ];

  return firstUsable(route, providers);
}

export async function fetchRealFundamentals(symbol: string): Promise<ProviderPayload<NormalizedFundamental[]>> {
  const route = `api/fundamentals/${symbol}`;
  const result = await fetchFmpFundamentals(route, symbol).catch((error): AttemptResult<NormalizedFundamental[]> => failed("Financial Modeling Prep", safeError(error)));
  return result.data?.length ? withUpdatedAt(result) : unavailable(result.error ?? "Fundamentals unavailable from provider.");
}

export async function fetchRealEarnings(symbol: string): Promise<ProviderPayload<NormalizedEarnings[]>> {
  const route = `api/earnings/${symbol}`;
  const result = await fetchFmpEarnings(route, symbol).catch((error): AttemptResult<NormalizedEarnings[]> => failed("Financial Modeling Prep", safeError(error)));
  return result.data?.length ? withUpdatedAt(result) : unavailable(result.error ?? "Earnings unavailable from provider.");
}

export async function fetchRealTechnicals(symbol: string): Promise<ProviderPayload<NormalizedTechnical[]>> {
  const route = `api/technical/${symbol}`;
  const history = await fetchRealHistory(symbol, { range: "1Y", interval: "1d" });
  const candles = history.data?.candles ?? [];
  const technicals = calculateTechnicals(candles);

  if (!technicals.length) {
    return unavailable("Not enough real candle history.");
  }

  return {
    data: technicals,
    source: `${history.source} OHLCV candles`,
    status: "delayed",
    delay: history.delay,
    updatedAt: new Date().toISOString()
  };
}

export async function fetchRealMarketNews(request: NewsRequest = {}): Promise<ProviderPayload<NormalizedNewsArticle[]>> {
  const route = "api/news/market";
  return fetchMergedNews(route, [
    () => fetchRssNews(route, request),
    () => fetchFinnhubMarketNews(route, request),
    () => fetchFinnhubMajorCompanyNews(route, request),
    () => fetchAlphaVantageNews(route, request),
    () => fetchNewsApiNews(route, request),
    () => fetchMarketauxNews(route, undefined, request)
  ], request);
}

export async function fetchRealTickerNews(symbol: string, request: NewsRequest = {}): Promise<ProviderPayload<NormalizedNewsArticle[]>> {
  const route = `api/news/ticker/${symbol}`;
  const identity = await getTickerIdentity(symbol);
  const tickerQueries = tickerNewsQueries(symbol);
  const payload = await fetchMergedNews(route, [
    () => fetchMarketauxNews(route, symbol, request),
    () => fetchFinnhubTickerNews(route, symbol, request),
    () => fetchAlphaVantageNews(route, request, symbol),
    ...tickerQueries.map((query) => () => fetchGNews(route, { ...request, query }))
  ], { ...request, limit: 100 });
  const articles = payload.data ?? [];
  const acceptedSamples: NonNullable<NewsProviderDebugMeta["acceptedSamples"]> = [];
  const rejectedSamples: NonNullable<NewsProviderDebugMeta["rejectedSamples"]> = [];
  let rejectedIncidentalMentionCount = 0;
  let rejectedProviderTagWithoutTopicRelevanceCount = 0;
  let rejectedTitleAboutOtherCompanyCount = 0;
  let rejectedSnippetOnlyUnrelatedTitleCount = 0;
  let rejectedWeakMatchBelowThresholdCount = 0;
  const matched = articles
    .map((article) => {
      const match = matchArticleToTicker(article, identity);
      const sample = { title: article.title, source: article.sourceName, score: match.score, reasons: match.reasons };
      if (match.matched) acceptedSamples.push(sample);
      else {
        if (match.reasons.includes("incidental_or_promotional_mention")) rejectedIncidentalMentionCount += 1;
        if (match.reasons.includes("provider_tag_without_topic_relevance")) rejectedProviderTagWithoutTopicRelevanceCount += 1;
        if (match.reasons.includes("title_about_other_company")) rejectedTitleAboutOtherCompanyCount += 1;
        if (match.reasons.includes("snippet_only_unrelated_title")) rejectedSnippetOnlyUnrelatedTitleCount += 1;
        if (match.reasons.includes("weak_match_below_threshold")) rejectedWeakMatchBelowThresholdCount += 1;
        rejectedSamples.push(sample);
      }
      return {
        article: {
          ...article,
          relatedTickers: Array.from(new Set([identity.normalizedSymbol, ...match.relatedTickers])).filter(Boolean),
          tickerMatchScore: match.score,
          tickerMatchReasons: match.reasons
        },
        match
      };
    })
    .filter(({ match }) => match.matched)
    .map(({ article }) => article)
    .sort(sortNewsNewestFirst);

  if (!matched.length) {
    return {
      data: [],
      source: payload.source,
      status: payload.status === "unavailable" ? "unavailable" : "partial",
      delay: payload.delay,
      updatedAt: payload.updatedAt,
      error: "No ticker-specific articles available right now.",
      meta: {
        ...(payload.meta ?? emptyNewsMeta()),
        tickerIdentity: identity,
        totalFetched: articles.length,
        totalAfterTickerFilter: 0,
        rejectedAsUnrelatedCount: articles.length,
        rejectedIncidentalMentionCount,
        rejectedProviderTagWithoutTopicRelevanceCount,
        rejectedTitleAboutOtherCompanyCount,
        rejectedSnippetOnlyUnrelatedTitleCount,
        rejectedWeakMatchBelowThresholdCount,
        acceptedSamples: [],
        rejectedSamples: rejectedSamples.slice(0, 8)
      }
    };
  }

  return {
    ...payload,
    data: matched,
    meta: {
      ...(payload.meta ?? emptyNewsMeta()),
      tickerIdentity: identity,
      totalFetched: articles.length,
      totalAfterTickerFilter: matched.length,
      rejectedAsUnrelatedCount: articles.length - matched.length,
      rejectedIncidentalMentionCount,
      rejectedProviderTagWithoutTopicRelevanceCount,
      rejectedTitleAboutOtherCompanyCount,
      rejectedSnippetOnlyUnrelatedTitleCount,
      rejectedWeakMatchBelowThresholdCount,
      acceptedSamples: acceptedSamples.slice(0, 8),
      rejectedSamples: rejectedSamples.slice(0, 8)
    }
  };
}

export async function traceMissingMarketNews(): Promise<NewsTraceReport> {
  const route = "api/debug/news-trace";
  const fragments = missingNewsFragments();
  const today = await fetchRealMarketNews({ range: "today", limit: 100 });
  const sevenDay = await fetchRealMarketNews({ range: "7d", limit: 100 });
  const providerResults: NewsTraceProviderResult[] = [];
  const seenProviderKeys = new Set<string>();
  const providers: Array<{ label: string; run: () => Promise<AttemptResult<NormalizedNewsArticle[]>> }> = [
    { label: "Marketaux latest market", run: () => fetchMarketauxNews(route, undefined, { range: "30d", limit: 100 }) },
    ...fragments.map((fragment) => ({
      label: `Marketaux search: ${fragment}`,
      run: () => fetchMarketauxNews(route, undefined, { range: "30d", limit: 100, query: fragment })
    })),
    { label: "Finnhub general", run: () => fetchFinnhubMarketNews(route, { range: "30d", limit: 100 }) },
    { label: "Finnhub company news", run: () => fetchFinnhubMajorCompanyNews(route, { range: "30d", limit: 100 }) },
    { label: "Alpha Vantage market", run: () => fetchAlphaVantageNews(route, { range: "30d", limit: 100 }) },
    ...fragments.map((fragment) => ({
      label: `Alpha Vantage search: ${fragment}`,
      run: () => fetchAlphaVantageNews(route, { range: "30d", limit: 100, query: fragment })
    })),
    { label: "NewsAPI market", run: () => fetchNewsApiNews(route, { range: "30d", limit: 100 }) },
    { label: "RSS feeds", run: () => fetchRssNews(route, { range: "30d", limit: 100 }) },
  ];

  for (const provider of providers) {
    const result = await provider.run().catch((error): AttemptResult<NormalizedNewsArticle[]> => failed(provider.label, safeError(error)));
    const key = `${provider.label}:${result.source}`;
    if (seenProviderKeys.has(key)) continue;
    seenProviderKeys.add(key);
    providerResults.push({
      sourceName: provider.label,
      provider: result.source,
      attempted: true,
      returnedCount: result.returnedCount ?? result.data?.length ?? 0,
      status: result.status,
      error: result.error,
      matchedArticles: traceMatchingArticles(result.data ?? [], fragments, today.data ?? [], sevenDay.data ?? [])
    });
  }

  return {
    fragments,
    providers: providerResults,
    lifecycle: {
      today: buildTraceLifecycle("today", today, fragments),
      sevenDay: buildTraceLifecycle("7d", sevenDay, fragments)
    }
  };
}

export async function fetchFredSeries(seriesId: string): Promise<ProviderPayload<NormalizedMacroSeries>> {
  const route = `api/macro/series/${seriesId}`;
  const result = await fetchFredSeriesAttempt(route, seriesId).catch((error): AttemptResult<NormalizedMacroSeries> => failed("FRED", safeError(error)));

  if (result.data) {
    logFinal(route, result.source, result.status, true);
    return withUpdatedAt(result);
  }

  logFinal(route, "Unavailable", "unavailable", false, result.error);
  return unavailable(result.error ?? "Macro data unavailable from FRED.");
}

async function firstUsable<T>(
  route: string,
  providers: Array<() => Promise<AttemptResult<T>>>,
  isUsable: (data: T | null) => boolean = (data) => data !== null
): Promise<ProviderPayload<T>> {
  const errors: string[] = [];
  providerHealthExtras = {};

  for (const provider of providers) {
    const result = await provider().catch((error): AttemptResult<T> => failed("Provider", safeError(error)));

    if (isUsable(result.data)) {
      logFinal(route, result.source, result.status, true);
      return withUpdatedAt(result);
    }

    if (result.error) {
      errors.push(`${result.source}: ${result.error}`);
    }
  }

  const error = errors.find(Boolean) ?? "Real data unavailable.";
  logFinal(route, "Unavailable", "unavailable", false, error);
  return unavailable(error);
}

async function fetchMergedNews(
  route: string,
  providers: Array<() => Promise<AttemptResult<NormalizedNewsArticle[]>>>,
  request: NewsRequest
): Promise<ProviderPayload<NormalizedNewsArticle[]>> {
  const limit = newsLimit(request.limit);
  const rangeStart = getRangeStart(request.range, request.timezone || NEWS_TIMEZONE);
  const errors: string[] = [];
  const sources = new Set<string>();
  const providerCounts: Record<string, number> = {};
  const acceptedCounts: Record<string, number> = {};
  const rejectedCounts: Record<string, number> = {};
  const providerHealth: NewsProviderDebugMeta["providerHealth"] = {};
  const rejectedReasons: Record<string, number> = {};
  const firstRejectedArticles: NewsProviderDebugMeta["firstRejectedArticles"] = [];
  let totalArticlesBeforeFiltering = 0;
  let totalArticlesAfterFiltering = 0;
  let liveProviderArticleCount = 0;
  let dedupedCount = 0;
  const liveRelevant: NormalizedNewsArticle[] = [];

  for (const provider of providers) {
    const result = await provider().catch((error): AttemptResult<NormalizedNewsArticle[]> => failed("Provider", safeError(error)));
    const providerName = result.source;
    const rawCount = result.returnedCount ?? result.data?.length ?? 0;
    const normalizedCount = result.acceptedCount ?? result.data?.length ?? 0;

    providerCounts[providerName] = (providerCounts[providerName] ?? 0) + rawCount;
    acceptedCounts[providerName] = (acceptedCounts[providerName] ?? 0) + normalizedCount;
    rejectedCounts[providerName] = (rejectedCounts[providerName] ?? 0) + (result.rejectedCount ?? 0);
    providerHealth[providerName] = providerHealthForResult(result);
    totalArticlesBeforeFiltering += normalizedCount;

    if (result.data?.length) {
      sources.add(result.source);
      liveProviderArticleCount += result.data.length;
      const inRange = result.data.filter((article) => {
        const keep = new Date(article.publishedAt) >= rangeStart;
        if (!keep) {
          rejectedCounts[result.source] = (rejectedCounts[result.source] ?? 0) + 1;
          rejectedReasons.outside_range = (rejectedReasons.outside_range ?? 0) + 1;
          addRejectedArticle(firstRejectedArticles, article, "outside_range");
          logNewsRejected(route, article, "outside_range");
        } else {
          logNewsAccepted(route, article);
        }
        return keep;
      });
      const relevant = inRange.filter((article) => {
        const keep = isMarketRelevantArticle(article);
        if (!keep) {
          rejectedCounts[result.source] = (rejectedCounts[result.source] ?? 0) + 1;
          rejectedReasons.unrelated = (rejectedReasons.unrelated ?? 0) + 1;
          addRejectedArticle(firstRejectedArticles, article, "unrelated");
          logNewsRejected(route, article, "unrelated");
        }
        return keep;
      });
      totalArticlesAfterFiltering += relevant.length;
      liveRelevant.push(...relevant.map((article) => ({ ...article, provider: result.source })));
      logNewsFinal(route, `merge_progress source=${result.source}`, request.range, liveRelevant.length);
    } else if (result.error) {
      errors.push(`${result.source}: ${result.error}`);
    }
  }

  const beforeLiveDedupe = liveRelevant.length;
  const dedupedLive = dedupeNews(liveRelevant, route).sort(sortNewsNewestFirst);
  dedupedCount += Math.max(0, beforeLiveDedupe - dedupedLive.length);
  if (dedupedLive.length) {
    await saveRealNewsToCache(dedupedLive, Array.from(sources).join(" + ") || "Provider");
  }

  const cachedArticles = (await readCachedNews(request.range ?? "7d")).filter((article) => isMarketRelevantArticle(article));
  const cachedCount = cachedArticles.length;
  if (cachedCount) sources.add("cached real articles");
  const beforeFinalDedupe = dedupedLive.length + cachedArticles.length;
  const merged = dedupeNews([...dedupedLive, ...cachedArticles], route)
    .sort(sortNewsNewestFirst)
    .slice(0, limit);
  dedupedCount += Math.max(0, beforeFinalDedupe - merged.length);

  if (merged.length) {
    const source = Array.from(sources).join(" + ");
    logNewsFinal(route, "final", request.range, merged.length);
    return {
      data: merged,
      source,
      status: sources.size > 1 || merged.length < limit ? "partial" : "delayed",
      delay: "Provider-dependent",
      updatedAt: new Date().toISOString(),
      meta: buildNewsDebugMeta({
        merged,
        sources,
        providerCounts,
        acceptedCounts,
        rejectedCounts,
        providerHealth,
        providerHealthExtras,
        rejectedReasons,
        firstRejectedArticles,
        dedupedCount,
        liveProviderArticleCount,
        cachedArticleCount: cachedCount,
        totalArticlesBeforeFiltering,
        totalArticlesAfterFiltering,
        totalArticlesAfterMerge: merged.length
      })
    };
  }

  const error = errors.find(Boolean) ?? "No real news available right now.";
  logNewsFinal(route, "final_unavailable", request.range, 0, error);
  return unavailable(error);
}

async function fetchFmpQuote(route: string, symbol: string): Promise<AttemptResult<NormalizedQuote>> {
  if (!serverEnv.fmpApiKey) return providerMissing(route, "FMP", symbol);
  const json = await providerJson(route, "FMP quote", symbol, `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(symbol)}&apikey=${serverEnv.fmpApiKey}`);
  const row = firstFmpPayloadRow(json.data);
  const quote = row ? normalizeFmpQuote(row, symbol) : null;
  logProvider(route, "FMP", symbol, json.httpStatus, json.keys, Boolean(quote));
  return quote ? delayed("Financial Modeling Prep", quote) : failed("Financial Modeling Prep", "FMP quote response had no usable rows.");
}

async function fetchFinnhubQuote(route: string, symbol: string): Promise<AttemptResult<NormalizedQuote>> {
  if (!serverEnv.finnhubApiKey) return providerMissing(route, "Finnhub", symbol);
  const quoteJson = await providerJson(route, "Finnhub", symbol, `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${serverEnv.finnhubApiKey}`);
  const profileJson = await providerJson(route, "Finnhub profile", symbol, `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${serverEnv.finnhubApiKey}`);
  const quote = normalizeFinnhubQuote(quoteJson.data, profileJson.data, symbol);
  logProvider(route, "Finnhub", symbol, quoteJson.httpStatus, quoteJson.keys, Boolean(quote));
  return quote ? delayed("Finnhub", quote) : failed("Finnhub", "Finnhub quote response had no usable price.");
}

async function fetchAlphaVantageQuote(route: string, symbol: string): Promise<AttemptResult<NormalizedQuote>> {
  if (!serverEnv.alphaVantageApiKey) return providerMissing(route, "Alpha Vantage", symbol);
  const json = await providerJson(route, "Alpha Vantage", symbol, `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${serverEnv.alphaVantageApiKey}`);
  const quote = normalizeAlphaVantageQuote(json.data, symbol);
  logProvider(route, "Alpha Vantage", symbol, json.httpStatus, json.keys, Boolean(quote));
  return quote ? delayed("Alpha Vantage", quote) : failed("Alpha Vantage", "Alpha Vantage quote response had no usable price.");
}

async function fetchAlpacaQuote(route: string, symbol: string): Promise<AttemptResult<NormalizedQuote>> {
  if (!serverEnv.alpacaApiKey || !serverEnv.alpacaSecretKey) return providerMissing(route, "Alpaca", symbol);
  const json = await providerJson(route, "Alpaca", symbol, `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest`, {
    "APCA-API-KEY-ID": serverEnv.alpacaApiKey,
    "APCA-API-SECRET-KEY": serverEnv.alpacaSecretKey
  });
  const quote = normalizeAlpacaQuote(json.data, symbol);
  logProvider(route, "Alpaca", symbol, json.httpStatus, json.keys, Boolean(quote));
  return quote ? delayed("Alpaca", quote) : failed("Alpaca", "Alpaca latest quote response had no usable data.");
}

async function fetchFmpHistory(route: string, symbol: string, request: HistoryRequest): Promise<AttemptResult<NormalizedHistory>> {
  if (!serverEnv.fmpApiKey) return providerMissing(route, "FMP", symbol);
  const interval = normalizeInterval(request.interval);
  const fmpInterval = fmpIntradayInterval(interval);
  const url = fmpInterval
    ? `https://financialmodelingprep.com/stable/historical-chart/${fmpInterval}?symbol=${encodeURIComponent(symbol)}&apikey=${serverEnv.fmpApiKey}`
    : `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&limit=${historyLimit(request.range)}&apikey=${serverEnv.fmpApiKey}`;
  const json = await providerJson(route, "FMP history", symbol, url);
  const rows = extractFmpPayloadRows(json.data);
  const candles = rows.map(normalizeFmpCandle).filter(isCandle).reverse();
  logProvider(route, "FMP", symbol, json.httpStatus, json.keys, candles.length > 0, `usableCandles=${candles.length}`);
  return candles.length ? delayed("Financial Modeling Prep", { symbol, candles }) : failed("Financial Modeling Prep", "FMP historical response had no usable candles.");
}

async function fetchAlphaVantageHistory(route: string, symbol: string, request: HistoryRequest): Promise<AttemptResult<NormalizedHistory>> {
  if (!serverEnv.alphaVantageApiKey) return providerMissing(route, "Alpha Vantage", symbol);
  const interval = normalizeInterval(request.interval);
  const alphaInterval = alphaVantageInterval(interval);
  const intraday = interval !== "1day" && alphaInterval;
  const url = intraday
    ? `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=${alphaInterval}&outputsize=full&apikey=${serverEnv.alphaVantageApiKey}`
    : `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${serverEnv.alphaVantageApiKey}`;
  const json = await providerJson(route, "Alpha Vantage", symbol, url);
  const series = json.data?.["Time Series (Daily)"] ?? json.data?.[`Time Series (${alphaInterval})`];
  const candles = series && typeof series === "object"
    ? Object.entries(series).map(([date, row]) => normalizeAlphaVantageCandle(date, row)).filter(isCandle).reverse()
    : [];
  logProvider(route, "Alpha Vantage", symbol, json.httpStatus, json.keys, candles.length > 0, `usableCandles=${candles.length}`);
  return candles.length ? delayed("Alpha Vantage", { symbol, candles }) : failed("Alpha Vantage", "Alpha Vantage history response had no usable candles.");
}

async function fetchTwelveDataHistory(route: string, symbol: string, request: HistoryRequest): Promise<AttemptResult<NormalizedHistory>> {
  if (!serverEnv.twelveDataApiKey) return providerMissing(route, "Twelve Data", symbol);
  const interval = twelveDataInterval(normalizeInterval(request.interval));
  const json = await providerJson(route, "Twelve Data", symbol, `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${historyLimit(request.range)}&apikey=${serverEnv.twelveDataApiKey}`);
  const rows = Array.isArray(json.data?.values) ? json.data.values : [];
  const candles = rows.map(normalizeTwelveDataCandle).filter(isCandle).reverse();
  logProvider(route, "Twelve Data", symbol, json.httpStatus, json.keys, candles.length > 0, `usableCandles=${candles.length}`);
  return candles.length ? delayed("Twelve Data", { symbol, candles }) : failed("Twelve Data", "Twelve Data history response had no usable candles.");
}

async function fetchAlpacaHistory(route: string, symbol: string, request: HistoryRequest): Promise<AttemptResult<NormalizedHistory>> {
  if (!serverEnv.alpacaApiKey || !serverEnv.alpacaSecretKey) return providerMissing(route, "Alpaca", symbol);
  const start = new Date(Date.now() - historyDays(request.range) * 24 * 60 * 60 * 1000).toISOString();
  const timeframe = alpacaTimeframe(normalizeInterval(request.interval));
  const json = await providerJson(route, "Alpaca", symbol, `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${timeframe}&start=${encodeURIComponent(start)}&limit=1000&adjustment=split`, {
    "APCA-API-KEY-ID": serverEnv.alpacaApiKey,
    "APCA-API-SECRET-KEY": serverEnv.alpacaSecretKey
  });
  const rows = Array.isArray(json.data?.bars) ? json.data.bars : [];
  const candles = rows.map(normalizeAlpacaCandle).filter(isCandle);
  logProvider(route, "Alpaca", symbol, json.httpStatus, json.keys, candles.length > 0, `usableCandles=${candles.length}`);
  return candles.length ? delayed("Alpaca", { symbol, candles }) : failed("Alpaca", "Alpaca history response had no usable candles.");
}

async function fetchFmpProfile(route: string, symbol: string): Promise<AttemptResult<NormalizedProfile>> {
  if (!serverEnv.fmpApiKey) return providerMissing(route, "FMP", symbol);
  const json = await providerJson(route, "FMP profile", symbol, `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(symbol)}&apikey=${serverEnv.fmpApiKey}`);
  const row = firstFmpPayloadRow(json.data);
  const profile = row ? normalizeFmpProfile(row, symbol) : null;
  logProvider(route, "FMP", symbol, json.httpStatus, json.keys, Boolean(profile));
  return profile ? delayed("Financial Modeling Prep", profile) : failed("Financial Modeling Prep", "FMP profile response had no usable rows.");
}

async function fetchFmpFundamentals(route: string, symbol: string): Promise<AttemptResult<NormalizedFundamental[]>> {
  if (!serverEnv.fmpApiKey) return providerMissing(route, "FMP", symbol);
  const [metrics, ratios, income, balance, cashflow, profile] = await Promise.all([
    providerJson(route, "FMP key metrics", symbol, `https://financialmodelingprep.com/stable/key-metrics-ttm?symbol=${encodeURIComponent(symbol)}&apikey=${serverEnv.fmpApiKey}`),
    providerJson(route, "FMP ratios", symbol, `https://financialmodelingprep.com/stable/ratios-ttm?symbol=${encodeURIComponent(symbol)}&apikey=${serverEnv.fmpApiKey}`),
    providerJson(route, "FMP income", symbol, `https://financialmodelingprep.com/stable/income-statement?symbol=${encodeURIComponent(symbol)}&limit=1&apikey=${serverEnv.fmpApiKey}`),
    providerJson(route, "FMP balance", symbol, `https://financialmodelingprep.com/stable/balance-sheet-statement?symbol=${encodeURIComponent(symbol)}&limit=1&apikey=${serverEnv.fmpApiKey}`),
    providerJson(route, "FMP cashflow", symbol, `https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${encodeURIComponent(symbol)}&limit=1&apikey=${serverEnv.fmpApiKey}`),
    providerJson(route, "FMP profile", symbol, `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(symbol)}&apikey=${serverEnv.fmpApiKey}`)
  ]);
  const metricRow = firstFmpPayloadRow(metrics.data);
  const ratioRow = firstFmpPayloadRow(ratios.data);
  const incomeRecord = firstFmpPayloadRow(income.data);
  const balanceRecord = firstFmpPayloadRow(balance.data);
  const cashflowRecord = firstFmpPayloadRow(cashflow.data);
  const profileRecord = firstFmpPayloadRow(profile.data);

  const metric = metricRow ?? {};
  const ratio = ratioRow ?? {};
  const incomeRow = incomeRecord ?? {};
  const balanceRow = balanceRecord ?? {};
  const cashflowRow = cashflowRecord ?? {};
  const profileRow = profileRecord ?? {};
  const rows: NormalizedFundamental[] = [
    fundamental("Revenue", currencyFrom(incomeRow.revenue), "Latest reported income statement"),
    fundamental("Gross Profit", currencyFrom(incomeRow.grossProfit), "Latest reported income statement"),
    fundamental("Gross Margin", percentValue(numberFrom(ratio.grossProfitMarginTTM) ?? margin(incomeRow.grossProfit, incomeRow.revenue)), "Calculated or provider ratio"),
    fundamental("Operating Income", currencyFrom(incomeRow.operatingIncome), "Latest reported income statement"),
    fundamental("Net Income", currencyFrom(incomeRow.netIncome), "Latest reported income statement"),
    fundamental("EPS", valueFrom(incomeRow.eps ?? incomeRow.epsdiluted), "Latest reported EPS"),
    fundamental("Free Cash Flow", currencyFrom(cashflowRow.freeCashFlow), "Latest cash flow statement"),
    fundamental("Total Debt", currencyFrom(balanceRow.totalDebt), "Latest balance sheet"),
    fundamental("Cash and Equivalents", currencyFrom(balanceRow.cashAndCashEquivalents), "Latest balance sheet"),
    fundamental("Shares Outstanding", numberDisplay(metric.sharesOutstandingTTM ?? profileRow.sharesOutstanding), "Provider shares outstanding"),
    fundamental("Market Cap", currencyFrom(profileRow.mktCap), "Provider company profile"),
    fundamental("P/E", ratioValue(ratio.peRatioTTM), "Provider ratio"),
    fundamental("Price/Sales", ratioValue(ratio.priceToSalesRatioTTM), "Provider ratio"),
    fundamental("Price/Book", ratioValue(ratio.priceToBookRatioTTM), "Provider ratio")
  ];
  const usable = rows.some((row) => row.value !== "Unavailable");
  logProvider(route, "FMP", symbol, 200, ["keyMetrics", "ratios", "income", "balance", "cashflow", "profile"], usable);
  return usable ? delayed("Financial Modeling Prep", rows) : failed("Financial Modeling Prep", "FMP fundamentals had no usable fields.");
}

async function fetchFmpEarnings(route: string, symbol: string): Promise<AttemptResult<NormalizedEarnings[]>> {
  if (!serverEnv.fmpApiKey) return providerMissing(route, "FMP", symbol);
  const json = await providerJson(route, "FMP earnings", symbol, `https://financialmodelingprep.com/stable/earnings?symbol=${encodeURIComponent(symbol)}&limit=8&apikey=${serverEnv.fmpApiKey}`);
  const rows = extractFmpPayloadRows(json.data);
  const earnings = rows.map((row) => {
    const record = asRecord(row);
    return {
      quarter: stringFrom(record.date, "Unavailable"),
      revenue: currencyFrom(record.revenue),
      eps: valueFrom(record.eps),
      surprise: valueFrom(record.eps ? numberFrom(record.eps)! - (numberFrom(record.epsEstimated) ?? numberFrom(record.eps)!) : null),
      guide: record.epsEstimated ? `EPS est. ${record.epsEstimated}` : "Unavailable"
    };
  });
  logProvider(route, "FMP", symbol, json.httpStatus, json.keys, earnings.length > 0, `usableEarnings=${earnings.length}`);
  return earnings.length ? delayed("Financial Modeling Prep", earnings) : failed("Financial Modeling Prep", "FMP earnings response had no usable rows.");
}

async function fetchFinnhubProfile(route: string, symbol: string): Promise<AttemptResult<NormalizedProfile>> {
  if (!serverEnv.finnhubApiKey) return providerMissing(route, "Finnhub", symbol);
  const json = await providerJson(route, "Finnhub", symbol, `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${serverEnv.finnhubApiKey}`);
  const profile = normalizeFinnhubProfile(json.data, symbol);
  logProvider(route, "Finnhub", symbol, json.httpStatus, json.keys, Boolean(profile));
  return profile ? delayed("Finnhub", profile) : failed("Finnhub", "Finnhub profile response had no usable company name.");
}

async function fetchMarketauxNews(route: string, symbol?: string, request: NewsRequest = {}): Promise<AttemptResult<NormalizedNewsArticle[]>> {
  if (!serverEnv.marketauxApiKey) return providerMissing(route, "Marketaux", symbol ?? "market");
  const params = new URLSearchParams({ api_token: serverEnv.marketauxApiKey, language: "en", limit: `${newsLimit(request.limit)}` });
  if (symbol) params.set("symbols", symbol);
  if (request.query) params.set("search", request.query);
  params.set("published_after", newsFromDate(request.range));
  const queryLabel = request.query ?? symbol ?? "market";
  const json = await providerJson(route, "Marketaux", queryLabel, `https://api.marketaux.com/v1/news/all?${params.toString()}`);
  const rows = Array.isArray(json.data?.data) ? json.data.data : [];
  const articles = rows.map(normalizeMarketauxArticle).filter(Boolean) as NormalizedNewsArticle[];
  logNewsProvider(route, "Marketaux", queryLabel, request.range, json.httpStatus, rows.length, articles.length);
  return articles.length
    ? { ...newsPayload("Marketaux", articles), returnedCount: rows.length, acceptedCount: articles.length, rejectedCount: rows.length - articles.length }
    : { ...failed("Marketaux", "Marketaux response had no usable articles."), returnedCount: rows.length, acceptedCount: 0, rejectedCount: rows.length };
}

async function fetchFinnhubMarketNews(route: string, request: NewsRequest = {}): Promise<AttemptResult<NormalizedNewsArticle[]>> {
  if (!serverEnv.finnhubApiKey) return providerMissing(route, "Finnhub", "market");
  const json = await providerJson(route, "Finnhub", "market", `https://finnhub.io/api/v1/news?category=general&token=${serverEnv.finnhubApiKey}`);
  const rows = Array.isArray(json.data) ? json.data : [];
  const articles = (rows.map((row) => normalizeFinnhubArticle(row)).filter(Boolean) as NormalizedNewsArticle[])
    .filter((article) => new Date(article.publishedAt) >= new Date(newsFromDate(request.range)))
    .slice(0, newsLimit(request.limit));
  logNewsProvider(route, "Finnhub", "general", request.range, json.httpStatus, rows.length, articles.length);
  return articles.length
    ? { ...newsPayload("Finnhub", articles), returnedCount: rows.length, acceptedCount: articles.length, rejectedCount: rows.length - articles.length }
    : { ...failed("Finnhub", "Finnhub market news response had no usable articles."), returnedCount: rows.length, acceptedCount: 0, rejectedCount: rows.length };
}

async function fetchFinnhubTickerNews(route: string, symbol: string, request: NewsRequest = {}): Promise<AttemptResult<NormalizedNewsArticle[]>> {
  if (!serverEnv.finnhubApiKey) return providerMissing(route, "Finnhub", symbol);
  const to = new Date().toISOString().slice(0, 10);
  const from = newsFromDate(request.range).slice(0, 10);
  const json = await providerJson(route, "Finnhub", symbol, `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${serverEnv.finnhubApiKey}`);
  const rows = Array.isArray(json.data) ? json.data : [];
  const articles = (rows.map((row) => normalizeFinnhubArticle(row, symbol)).filter(Boolean) as NormalizedNewsArticle[]).slice(0, newsLimit(request.limit));
  logNewsProvider(route, "Finnhub", symbol, request.range, json.httpStatus, rows.length, articles.length);
  return articles.length
    ? { ...newsPayload("Finnhub", articles), returnedCount: rows.length, acceptedCount: articles.length, rejectedCount: rows.length - articles.length }
    : { ...failed("Finnhub", "Finnhub ticker news response had no usable articles."), returnedCount: rows.length, acceptedCount: 0, rejectedCount: rows.length };
}

async function fetchFinnhubMajorCompanyNews(route: string, request: NewsRequest = {}): Promise<AttemptResult<NormalizedNewsArticle[]>> {
  if (!serverEnv.finnhubApiKey) return providerMissing(route, "Finnhub company news", "major_tickers");
  const symbols = ["SPY", "QQQ", "DIA", "IWM", "AAPL", "MSFT", "NVDA", "AMD", "MU", "AVGO", "TSM", "ARM", "TSLA", "META", "GOOGL", "AMZN", "JPM", "XOM", "GLD", "TLT"];
  const articles: NormalizedNewsArticle[] = [];
  let returnedCount = 0;

  for (const symbol of symbols) {
    const result = await fetchFinnhubTickerNews(route, symbol, { ...request, limit: 20 }).catch((error): AttemptResult<NormalizedNewsArticle[]> => failed("Finnhub company news", safeError(error)));
    returnedCount += result.returnedCount ?? result.data?.length ?? 0;
    if (result.data?.length) articles.push(...result.data);
  }

  return articles.length
    ? { ...newsPayload("Finnhub company news", articles), returnedCount, acceptedCount: articles.length, rejectedCount: Math.max(0, returnedCount - articles.length) }
    : { ...failed("Finnhub company news", "Finnhub company news had no usable articles."), returnedCount, acceptedCount: 0, rejectedCount: returnedCount };
}

async function fetchGNews(route: string, request: NewsRequest = {}): Promise<AttemptResult<NormalizedNewsArticle[]>> {
  if (!serverEnv.gnewsApiKey) return providerMissing(route, "GNews", request.query ?? "market");
  const params = new URLSearchParams({
    q: request.query ?? "stock market",
    lang: "en",
    max: `${Math.min(10, newsLimit(request.limit))}`,
    from: newsFromDate(request.range),
    apikey: serverEnv.gnewsApiKey
  });
  const json = await providerJson(route, "GNews", request.query ?? "market", `https://gnews.io/api/v4/search?${params.toString()}`);
  const rows = Array.isArray(json.data?.articles) ? json.data.articles : [];
  const articles = rows.map(normalizeGNewsArticle).filter(Boolean) as NormalizedNewsArticle[];
  logNewsProvider(route, "GNews", request.query ?? "market", request.range, json.httpStatus, rows.length, articles.length);
  return articles.length
    ? { ...newsPayload("GNews", articles), returnedCount: rows.length, acceptedCount: articles.length, rejectedCount: rows.length - articles.length }
    : { ...failed("GNews", "GNews response had no usable articles."), returnedCount: rows.length, acceptedCount: 0, rejectedCount: rows.length };
}

async function fetchAlphaVantageNews(route: string, request: NewsRequest = {}, symbol?: string): Promise<AttemptResult<NormalizedNewsArticle[]>> {
  if (!serverEnv.alphaVantageApiKey) return providerMissing(route, "Alpha Vantage News", symbol ?? "market");
  const groups = symbol || request.query
    ? [{ label: symbol ?? request.query ?? "market", tickers: symbol, keywords: request.query, topics: undefined }]
    : [
        { label: "mega-cap tech", tickers: "NVDA,AAPL,MSFT,AMZN,GOOGL,META,TSLA", keywords: undefined, topics: "technology,financial_markets,earnings" },
        { label: "indexes", tickers: "SPY,QQQ,DIA,IWM", keywords: undefined, topics: "financial_markets,economy_macro" },
        { label: "semiconductors", tickers: "AMD,MU,AVGO,TSM,ARM", keywords: undefined, topics: "technology,financial_markets" },
        { label: "financials", tickers: "JPM,BAC,GS,MS", keywords: undefined, topics: "finance,financial_markets" },
        { label: "energy", tickers: "XOM,CVX,USO", keywords: undefined, topics: "energy_transportation,financial_markets" },
        { label: "macro assets", tickers: "GLD,TLT", keywords: undefined, topics: "economy_macro,financial_markets" }
      ];
  const articles: NormalizedNewsArticle[] = [];
  let returnedCount = 0;

  for (const group of groups) {
    const params = new URLSearchParams({ function: "NEWS_SENTIMENT", sort: "LATEST", limit: `${Math.min(50, newsLimit(request.limit))}`, apikey: serverEnv.alphaVantageApiKey });
    if (group.tickers) params.set("tickers", group.tickers);
    if (group.keywords) params.set("keywords", group.keywords);
    if (group.topics) params.set("topics", group.topics);
    const json = await providerJson(route, "Alpha Vantage News", group.label, `https://www.alphavantage.co/query?${params.toString()}`);
    const rows = Array.isArray(json.data?.feed) ? json.data.feed : [];
    returnedCount += rows.length;
    articles.push(...rows.map(normalizeAlphaVantageArticle).filter(Boolean) as NormalizedNewsArticle[]);
    logNewsProvider(route, "Alpha Vantage News", group.label, request.range, json.httpStatus, rows.length, articles.length);
  }

  return articles.length
    ? { ...newsPayload("Alpha Vantage", articles), returnedCount, acceptedCount: articles.length, rejectedCount: Math.max(0, returnedCount - articles.length) }
    : { ...failed("Alpha Vantage", "Alpha Vantage NEWS_SENTIMENT response had no usable articles."), returnedCount, acceptedCount: 0, rejectedCount: returnedCount };
}

async function fetchRssNews(route: string, request: NewsRequest = {}): Promise<AttemptResult<NormalizedNewsArticle[]>> {
  const result = await fetchRssMarketNews(request.range, newsLimit(request.limit));
  const articles = result.articles.map((article) => normalizeRawRssArticle(article)).filter(Boolean) as NormalizedNewsArticle[];
  const returnedCount = result.health.reduce((total, item) => total + item.returned, 0);
  providerHealthExtras.RSS = result.health;
  result.health.forEach((item) => logNewsProvider(route, `RSS:${item.source}`, item.source, request.range, item.ok ? 200 : 0, item.returned, item.accepted));

  return articles.length
    ? { ...newsPayload("RSS", articles), returnedCount, acceptedCount: articles.length, rejectedCount: Math.max(0, returnedCount - articles.length) }
    : { ...failed("RSS", "RSS feeds had no usable articles."), returnedCount, acceptedCount: 0, rejectedCount: returnedCount };
}

async function fetchNewsApiNews(route: string, request: NewsRequest = {}): Promise<AttemptResult<NormalizedNewsArticle[]>> {
  const result = await fetchNewsApiMarketNews(request.range, newsLimit(request.limit));
  providerHealthExtras.NewsAPI = result.health;
  if (!result.health.attempted) return providerMissing(route, "NewsAPI", "market");
  const articles = result.articles.map((article) => normalizeNewsApiProviderArticle(article)).filter(Boolean) as NormalizedNewsArticle[];
  logNewsProvider(route, "NewsAPI", "market", request.range, result.health.ok ? 200 : 0, result.health.returned, articles.length);
  return articles.length
    ? { ...newsPayload("NewsAPI", articles), returnedCount: result.health.returned, acceptedCount: articles.length, rejectedCount: Math.max(0, result.health.returned - articles.length) }
    : { ...failed("NewsAPI", result.health.safeError ?? "NewsAPI had no usable articles."), returnedCount: result.health.returned, acceptedCount: 0, rejectedCount: result.health.returned };
}

async function fetchFredSeriesAttempt(route: string, seriesId: string): Promise<AttemptResult<NormalizedMacroSeries>> {
  if (!serverEnv.fredApiKey) return providerMissing(route, "FRED", seriesId);
  const observations = await providerJson(route, "FRED observations", seriesId, `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(seriesId)}&api_key=${serverEnv.fredApiKey}&file_type=json&sort_order=desc&limit=30`);
  const series = await providerJson(route, "FRED series", seriesId, `https://api.stlouisfed.org/fred/series?series_id=${encodeURIComponent(seriesId)}&api_key=${serverEnv.fredApiKey}&file_type=json`);
  const rows = Array.isArray(observations.data?.observations) ? observations.data.observations : [];
  const latest = rows.find((row: Record<string, unknown>) => typeof row.value === "string" && row.value !== "." && Number.isFinite(Number(row.value)));
  const meta = Array.isArray(series.data?.seriess) ? series.data.seriess[0] : null;
  const data = latest
    ? {
        seriesId,
        date: String(latest.date),
        value: Number(latest.value),
        units: String(meta?.units ?? ""),
        title: String(meta?.title ?? seriesId)
      }
    : null;
  logProvider(route, "FRED", seriesId, observations.httpStatus, observations.keys, Boolean(data));
  return data ? { data, source: "FRED", status: "delayed", delay: "End-of-day / release-based" } : failed("FRED", "FRED series had no valid observation.");
}

async function providerJson(route: string, provider: string, query: string, url: string, headers?: HeadersInit) {
  let response: Response | null = null;
  let responseBody = "";

  try {
    response = await fetch(url, { headers, next: { revalidate: CACHE_SECONDS } });
    responseBody = await response.text();
    const data = safeJsonParse(responseBody);
    const keys = responseShapeKeys(data);

    if (!response.ok) {
      console.error(`[${route}] provider=${provider} symbol=${query} endpoint=${provider} status=${response.status} url=${redactUrl(url)} body=${truncateResponseBody(responseBody)} keys=[${keys.join(",")}] usable=false reason=http_error`);
      throw new Error(providerHttpError(response.status));
    }

    return { data: data as any, httpStatus: response.status, keys };
  } catch (error) {
    const status = response?.status ?? "request_failed";
    console.error(`[${route}] provider=${provider} symbol=${query} endpoint=${provider} status=${status} url=${redactUrl(url)} body=${truncateResponseBody(responseBody)} reason=${safeError(error)}`);
    throw new Error(safeError(error));
  }
}

function safeJsonParse(body: string): any {
  if (!body) return null;

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function truncateResponseBody(body: string, maxLength = 1200) {
  const normalized = body.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized || "<empty>";
}

function redactUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("apikey")) parsed.searchParams.set("apikey", "[REDACTED]");
    return parsed.toString();
  } catch {
    return url.replace(/apikey=[^&\s]+/gi, "apikey=[REDACTED]");
  }
}

function firstFmpPayloadRow(data: unknown): Record<string, unknown> | null {
  const rows = extractFmpPayloadRows(data);
  return rows.length ? asRecord(rows[0]) : null;
}

function extractFmpPayloadRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const record = asRecord(data);
    if (Array.isArray(record.data)) return record.data;
    if (Array.isArray(record.historical)) return record.historical;
    if (Array.isArray(record.results)) return record.results;
    return [record];
  }
  return [];
}

function normalizeFmpQuote(row: Record<string, unknown>, symbol: string): NormalizedQuote | null {
  const price = numberFrom(row.price);
  if (!price) return null;
  return {
    symbol: stringFrom(row.symbol, symbol),
    name: stringFrom(row.name, symbol),
    price,
    change: numberFrom(row.change) ?? 0,
    changePercent: numberFrom(row.changesPercentage) ?? numberFrom(row.changePercentage) ?? 0,
    previousClose: numberFrom(row.previousClose),
    open: numberFrom(row.open),
    dayHigh: numberFrom(row.dayHigh),
    dayLow: numberFrom(row.dayLow),
    volume: numberFrom(row.volume),
    marketCap: numberFrom(row.marketCap)
  };
}

function normalizeFinnhubQuote(row: unknown, profile: unknown, symbol: string): NormalizedQuote | null {
  const quote = asRecord(row);
  const company = asRecord(profile);
  const price = numberFrom(quote.c);
  if (!price) return null;
  const previousClose = numberFrom(quote.pc);
  const change = numberFrom(quote.d) ?? (previousClose ? price - previousClose : 0);
  return {
    symbol,
    name: stringFrom(company.name, symbol),
    price,
    change,
    changePercent: numberFrom(quote.dp) ?? 0,
    previousClose,
    open: numberFrom(quote.o),
    dayHigh: numberFrom(quote.h),
    dayLow: numberFrom(quote.l),
    volume: null,
    marketCap: numberFrom(company.marketCapitalization)
  };
}

function normalizeAlphaVantageQuote(data: unknown, symbol: string): NormalizedQuote | null {
  const row = asRecord(asRecord(data)["Global Quote"]);
  const price = numberFrom(row["05. price"]);
  if (!price) return null;
  return {
    symbol: stringFrom(row["01. symbol"], symbol),
    name: symbol,
    price,
    change: numberFrom(row["09. change"]) ?? 0,
    changePercent: percentFrom(row["10. change percent"]) ?? 0,
    previousClose: numberFrom(row["08. previous close"]),
    open: numberFrom(row["02. open"]),
    dayHigh: numberFrom(row["03. high"]),
    dayLow: numberFrom(row["04. low"]),
    volume: numberFrom(row["06. volume"]),
    marketCap: null
  };
}

function normalizeAlpacaQuote(data: unknown, symbol: string): NormalizedQuote | null {
  const quote = asRecord(asRecord(data).quote);
  const bid = numberFrom(quote.bp);
  const ask = numberFrom(quote.ap);
  const price = bid && ask ? (bid + ask) / 2 : ask ?? bid;
  if (!price) return null;
  return {
    symbol,
    name: symbol,
    price,
    change: 0,
    changePercent: 0,
    previousClose: null,
    open: null,
    dayHigh: null,
    dayLow: null,
    volume: null,
    marketCap: null
  };
}

function normalizeFmpProfile(row: Record<string, unknown>, symbol: string): NormalizedProfile {
  return {
    symbol: stringFrom(row.symbol, symbol),
    name: stringFrom(row.companyName, symbol),
    companyName: stringFrom(row.companyName, symbol),
    sector: stringFrom(row.sector, "Data unavailable"),
    industry: stringFrom(row.industry, "Data unavailable"),
    description: stringFrom(row.description, "Data unavailable"),
    exchange: stringFrom(row.exchangeShortName ?? row.exchange, "Data unavailable"),
    currency: stringFrom(row.currency, "USD"),
    marketCap: numberFrom(row.mktCap),
    website: stringFrom(row.website, ""),
    image: stringFrom(row.image, "")
  };
}

function normalizeFinnhubProfile(data: unknown, symbol: string): NormalizedProfile | null {
  const row = asRecord(data);
  const name = stringFrom(row.name, "");
  if (!name) return null;
  return {
    symbol,
    name,
    companyName: name,
    sector: stringFrom(row.finnhubIndustry, "Data unavailable"),
    industry: stringFrom(row.finnhubIndustry, "Data unavailable"),
    description: "Data unavailable",
    exchange: stringFrom(row.exchange, "Data unavailable"),
    currency: stringFrom(row.currency, "USD"),
    marketCap: numberFrom(row.marketCapitalization),
    website: stringFrom(row.weburl, ""),
    image: stringFrom(row.logo, "")
  };
}

function normalizeFmpCandle(row: unknown): NormalizedCandle | null {
  const record = asRecord(row);
  return makeCandle(record.date, record.open, record.high, record.low, record.close, record.volume);
}

function normalizeAlphaVantageCandle(date: string, row: unknown): NormalizedCandle | null {
  const record = asRecord(row);
  return makeCandle(date, record["1. open"], record["2. high"], record["3. low"], record["4. close"], record["6. volume"] ?? record["5. volume"]);
}

function normalizeTwelveDataCandle(row: unknown): NormalizedCandle | null {
  const record = asRecord(row);
  return makeCandle(record.datetime, record.open, record.high, record.low, record.close, record.volume);
}

function normalizeAlpacaCandle(row: unknown): NormalizedCandle | null {
  const record = asRecord(row);
  return makeCandle(record.t, record.o, record.h, record.l, record.c, record.v);
}

function normalizeMarketauxArticle(row: unknown): NormalizedNewsArticle | null {
  const record = asRecord(row);
  const title = stringFrom(record.title, "");
  const url = stringFrom(record.url, "");
  if (!title || !url) return null;
  const entities = Array.isArray(record.entities) ? record.entities : [];
  return enrichNewsArticle({
    id: stringFrom(record.uuid ?? record.id, url),
    headline: title,
    title,
    sourceName: stringFrom(record.source, "Marketaux"),
    author: stringFrom(record.author, "") || undefined,
    url,
    publishedAt: stringFrom(record.published_at, new Date().toISOString()),
    category: stringFrom(record.category, "Market"),
    relatedTickers: entities.map((entity) => stringFrom(asRecord(entity).symbol, "")).filter(Boolean),
    sentiment: stringFrom(record.sentiment, "") || undefined,
    impactLevel: undefined,
    snippet: stringFrom(record.description ?? record.snippet, "")
  });
}

function normalizeFinnhubArticle(row: unknown, symbol?: string): NormalizedNewsArticle | null {
  const record = asRecord(row);
  const title = stringFrom(record.headline, "");
  const url = stringFrom(record.url, "");
  if (!title || !url) return null;
  const datetime = numberFrom(record.datetime);
  return enrichNewsArticle({
    id: String(record.id ?? url),
    headline: title,
    title,
    sourceName: stringFrom(record.source, "Finnhub"),
    author: undefined,
    url,
    publishedAt: datetime ? new Date(datetime * 1000).toISOString() : new Date().toISOString(),
    category: stringFrom(record.category, "Market"),
    relatedTickers: symbol ? [symbol] : [],
    sentiment: undefined,
    impactLevel: undefined,
    snippet: stringFrom(record.summary, "")
  });
}

function normalizeGNewsArticle(row: unknown): NormalizedNewsArticle | null {
  const record = asRecord(row);
  const source = asRecord(record.source);
  const title = stringFrom(record.title, "");
  const url = stringFrom(record.url, "");
  const publishedAt = stringFrom(record.publishedAt, "");
  const sourceName = stringFrom(source.name, "GNews");
  if (!title || !url || !publishedAt || !sourceName) return null;

  return enrichNewsArticle({
    id: url,
    headline: title,
    title,
    sourceName,
    author: undefined,
    url,
    publishedAt,
    category: inferNewsCategory(`${title} ${stringFrom(record.description, "")}`),
    relatedTickers: inferRelatedTickers(`${title} ${stringFrom(record.description, "")}`),
    sentiment: undefined,
    impactLevel: undefined,
    snippet: stringFrom(record.description ?? record.content, "")
  });
}

function normalizeAlphaVantageArticle(row: unknown): NormalizedNewsArticle | null {
  const record = asRecord(row);
  const title = stringFrom(record.title, "");
  const url = stringFrom(record.url, "");
  const publishedAt = parseAlphaVantageNewsTime(stringFrom(record.time_published, ""));
  if (!title || !url || !publishedAt) return null;
  const tickerRows = Array.isArray(record.ticker_sentiment) ? record.ticker_sentiment : [];
  const topicRows = Array.isArray(record.topics) ? record.topics : [];

  return enrichNewsArticle({
    id: url,
    headline: title,
    title,
    sourceName: stringFrom(record.source, "Alpha Vantage"),
    author: Array.isArray(record.authors) ? record.authors.map((author) => String(author)).filter(Boolean).join(", ") || undefined : undefined,
    url,
    publishedAt,
    category: inferNewsCategory(`${title} ${stringFrom(record.summary, "")} ${topicRows.map((topic) => stringFrom(asRecord(topic).topic, "")).join(" ")}`),
    relatedTickers: tickerRows.map((ticker) => stringFrom(asRecord(ticker).ticker, "")).filter(Boolean),
    sentiment: stringFrom(record.overall_sentiment_label, "") || undefined,
    impactLevel: undefined,
    snippet: stringFrom(record.summary, "")
  });
}

function normalizeRssArticle(row: unknown): NormalizedNewsArticle | null {
  const record = asRecord(row);
  const title = stringFrom(record.title, "");
  const url = stringFrom(record.url, "");
  const publishedAt = stringFrom(record.publishedAt, "");
  const sourceName = stringFrom(record.sourceName, "RSS");
  if (!title || !url || !publishedAt) return null;

  return enrichNewsArticle({
    id: url,
    headline: title,
    title,
    sourceName,
    author: stringFrom(record.author, "") || undefined,
    url,
    publishedAt,
    category: inferNewsCategory(`${title} ${stringFrom(record.snippet, "")} ${sourceName}`),
    relatedTickers: inferRelatedTickers(`${title} ${stringFrom(record.snippet, "")}`),
    sentiment: undefined,
    impactLevel: undefined,
    snippet: stringFrom(record.snippet, "")
  });
}

function normalizeRawRssArticle(row: RawRssArticle): NormalizedNewsArticle | null {
  return enrichNewsArticle({
    id: row.url,
    headline: row.title,
    title: row.title,
    sourceName: row.sourceName,
    author: row.author,
    url: row.url,
    publishedAt: row.publishedAt,
    category: row.category,
    relatedTickers: inferRelatedTickers(`${row.title} ${row.snippet}`),
    sentiment: "neutral",
    impactLevel: undefined,
    snippet: row.snippet,
    provider: row.provider
  });
}

function normalizeNewsApiProviderArticle(row: RawNewsApiArticle): NormalizedNewsArticle | null {
  return enrichNewsArticle({
    id: row.url,
    headline: row.title,
    title: row.title,
    sourceName: row.sourceName,
    author: row.author,
    url: row.url,
    publishedAt: row.publishedAt,
    category: inferNewsCategory(`${row.title} ${row.snippet}`),
    relatedTickers: inferRelatedTickers(`${row.title} ${row.snippet}`),
    sentiment: "neutral",
    impactLevel: undefined,
    snippet: row.snippet,
    provider: row.provider
  });
}

function enrichNewsArticle(article: Omit<NormalizedNewsArticle, "publishedLocalTime" | "localDateBucket" | "primaryCategory" | "categories">): NormalizedNewsArticle {
  const timestamp = normalizeArticleTimestamp(article.publishedAt, article.provider ?? article.sourceName);
  const timestampedArticle = { ...article, publishedAt: timestamp.publishedAtUtc };
  const classification = classifyNewsArticle(timestampedArticle);
  return {
    ...timestampedArticle,
    category: classification.primaryCategory,
    primaryCategory: classification.primaryCategory,
    categories: classification.categories,
    publishedLocalTime: timestamp.publishedLocalTime || formatLocalArticleTime(timestamp.publishedAtUtc, NEWS_TIMEZONE),
    localDateBucket: getLocalDateBucket(timestamp.publishedAtUtc, NEWS_TIMEZONE),
    timestampValid: timestamp.timestampValid,
    timestampSource: timestamp.timestampSource,
    timestampWarning: timestamp.timestampWarning
  };
}

function makeCandle(timeValue: unknown, openValue: unknown, highValue: unknown, lowValue: unknown, closeValue: unknown, volumeValue: unknown): NormalizedCandle | null {
  const time = stringFrom(timeValue, "");
  const open = numberFrom(openValue);
  const high = numberFrom(highValue);
  const low = numberFrom(lowValue);
  const close = numberFrom(closeValue);
  const volume = numberFrom(volumeValue) ?? 0;
  if (!time || open === null || high === null || low === null || close === null) return null;
  return { time: time.includes("T") ? time : time.slice(0, 10), open, high, low, close, volume };
}

function isCandle(candle: NormalizedCandle | null): candle is NormalizedCandle {
  return Boolean(candle);
}

function delayed<T>(source: string, data: T): AttemptResult<T> {
  return { data, source, status: "delayed", delay: "Provider delayed" };
}

function newsPayload<T>(source: string, data: T): AttemptResult<T> {
  return { data, source, status: "delayed", delay: "Provider-dependent" };
}

function failed<T>(source: string, error: string): AttemptResult<T> {
  return { data: null, source, status: "unavailable", delay: "N/A", error };
}

function unavailable<T>(error: string): ProviderPayload<T> {
  return { data: null, source: "Unavailable", status: "unavailable", delay: "N/A", updatedAt: new Date().toISOString(), error };
}

function providerMissing<T>(route: string, provider: string, query: string): AttemptResult<T> {
  console.info(`[${route}] provider=${provider} query=${query} status=not_configured keys=[] usable=false reason=missing_env`);
  return failed(provider, `${provider} is not configured.`);
}

function withUpdatedAt<T>(result: AttemptResult<T>): ProviderPayload<T> {
  return { ...result, updatedAt: new Date().toISOString() };
}

function logProvider(route: string, provider: string, query: string, status: number, keys: string[], usable: boolean, extra = "") {
  console.info(`[${route}] provider=${provider} query=${query} status=${status} keys=[${keys.join(",")}] usable=${usable}${extra ? ` ${extra}` : ""}`);
}

function logFinal(route: string, source: string, status: string, hasData: boolean, error?: string) {
  console.info(`[${route}] final source=${source} status=${status} data=${hasData ? "present" : "null"}${error ? ` reason=${error}` : ""}`);
}

function logNewsProvider(route: string, provider: string, query: string, range: string | undefined, status: number, returned: number, accepted: number) {
  console.info(`[${route}] provider=${provider} query="${query}" range=${range ?? "7d"} status=${status} returned=${returned} accepted=${accepted}`);
}

function logNewsFinal(route: string, label: string, range: string | undefined, count: number, error?: string) {
  console.info(`[${route}] ${label} count=${count} range=${range ?? "7d"}${error ? ` reason=${error}` : ""}`);
}

function logNewsAccepted(route: string, article: NormalizedNewsArticle) {
  console.info(`[${route}] accepted title="${safeLogTitle(article.title)}" localTime="${article.publishedLocalTime}" bucket=${article.localDateBucket}`);
}

function logNewsRejected(route: string, article: NormalizedNewsArticle, reason: string) {
  console.info(`[${route}] rejected title="${safeLogTitle(article.title)}" reason=${reason}`);
}

function logNewsDedupeKept(route: string, article: NormalizedNewsArticle) {
  console.info(`[news/dedupe] route=${route} kept title="${safeLogTitle(article.title)}" source="${article.sourceName}" localTime="${article.publishedLocalTime}"`);
}

function logNewsDedupeRemoved(route: string, article: NormalizedNewsArticle, reason: string, duplicateOf?: NormalizedNewsArticle) {
  console.info(`[news/dedupe] route=${route} removed title="${safeLogTitle(article.title)}" reason="${reason}" duplicateOf="${duplicateOf ? safeLogTitle(duplicateOf.title) : "unknown"}"`);
}

function safeLogTitle(title: string) {
  return title.replace(/"/g, "'").slice(0, 120);
}

function providerHttpError(status: number) {
  if (status === 401 || status === 403) return "Provider authentication failed.";
  if (status === 429) return "API limit reached. Try again later.";
  return "Real data unavailable.";
}

function safeError(error: unknown) {
  if (!(error instanceof Error)) return "unknown";
  const message = error.message;
  if (message.includes("API") || message.includes("limit") || message.includes("unavailable") || message.includes("usable") || message.includes("configured") || message.includes("unexpected") || message.includes("authentication") || message.includes("failed")) {
    return message;
  }
  return "request_failed";
}

function responseShapeKeys(data: unknown) {
  if (Array.isArray(data)) return ["array", `length:${data.length}`];
  if (data && typeof data === "object") return Object.keys(data as Record<string, unknown>).slice(0, 8);
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberFrom(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace("%", "")) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function percentFrom(value: unknown) {
  return numberFrom(value);
}

function stringFrom(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function dedupeNews(articles: NormalizedNewsArticle[], route = "news") {
  const seen = new Set<string>();
  const seenTitles = new Map<string, NormalizedNewsArticle>();
  const seenUrls = new Map<string, NormalizedNewsArticle>();
  const deduped: NormalizedNewsArticle[] = [];

  for (const article of articles) {
    const urlKey = article.url ? `url:${canonicalNewsUrl(article.url)}` : "";
    const titleKey = `title:${normalizeNewsTitle(article.title)}`;
    const duplicateUrl = urlKey ? seenUrls.get(urlKey) : undefined;
    const duplicateTitle = seenTitles.get(titleKey);
    if (duplicateUrl || duplicateTitle) {
      logNewsDedupeRemoved(route, article, duplicateUrl ? "duplicate_url" : "duplicate_title", duplicateUrl ?? duplicateTitle);
      continue;
    }
    if (urlKey) seen.add(urlKey);
    seen.add(titleKey);
    if (urlKey) seenUrls.set(urlKey, article);
    seenTitles.set(titleKey, article);
    logNewsDedupeKept(route, article);
    deduped.push(article);
  }

  return deduped;
}

function normalizeNewsTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalNewsUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((param) => parsed.searchParams.delete(param));
    return parsed.toString().toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function sortNewsNewestFirst(a: NormalizedNewsArticle, b: NormalizedNewsArticle) {
  return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
}

function marketNewsQueries() {
  return ["stock market", "S&P 500", "Nasdaq", "Federal Reserve", "earnings", "treasury yields", "oil prices", "gold", "futures"];
}

function tickerNewsQueries(symbol: string) {
  const upper = symbol.toUpperCase();
  const companyMap: Record<string, string[]> = {
    NVDA: ["Nvidia", "NVIDIA stock", "semiconductors", "AI chips", "data center stocks"],
    AMD: ["Advanced Micro Devices", "AMD stock", "semiconductors", "AI chips"],
    MU: ["Micron", "Micron stock", "memory chips", "semiconductors"],
    TSLA: ["Tesla", "Tesla stock", "electric vehicles"],
    AAPL: ["Apple", "Apple stock"],
    MSFT: ["Microsoft", "Microsoft stock", "artificial intelligence stocks"],
    QQQ: ["Nasdaq", "QQQ ETF", "mega-cap tech"],
    SPY: ["S&P 500", "SPY ETF", "stock market"]
  };
  return [upper, ...(companyMap[upper] ?? [`${upper} stock`])];
}

function inferNewsCategory(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("fed") || lower.includes("federal reserve")) return "Fed";
  if (lower.includes("yield") || lower.includes("treasury")) return "Yields";
  if (lower.includes("earnings")) return "Earnings";
  if (lower.includes("oil") || lower.includes("crude")) return "Energy";
  if (lower.includes("gold") || lower.includes("silver")) return "Metals";
  if (lower.includes("future")) return "Index Futures";
  if (lower.includes("bank") || lower.includes("insurance") || lower.includes("reinsurance") || lower.includes("roe") || lower.includes("underwriting")) return "Finance";
  if (lower.includes("ai") || lower.includes("artificial intelligence")) return "AI";
  if (lower.includes("chip") || lower.includes("semiconductor")) return "Semiconductors";
  if (lower.includes("inflation") || lower.includes("jobs") || lower.includes("macro")) return "Macro";
  return "Market";
}

function isMarketRelevantArticle(article: NormalizedNewsArticle) {
  const text = `${article.title} ${article.headline} ${article.snippet} ${article.sourceName}`.toLowerCase();
  if (isClearlyUnrelatedToMarkets(text)) return false;
  if (article.relatedTickers.length > 0) return true;
  return marketRelevanceKeywords.some((keyword) => keywordMatches(text, keyword));
}

export async function getTickerIdentity(symbol: string): Promise<TickerIdentity> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const profile = await fetchRealProfile(normalizedSymbol).catch(() => null);
  const profileData = profile?.data;
  const fallback = fallbackTickerIdentity[normalizedSymbol];
  const companyName = profileData?.companyName || profileData?.name || fallback?.companyName || normalizedSymbol;
  const assetType = fallback?.assetType ?? inferAssetType(normalizedSymbol, companyName);
  const shortName = cleanCompanyName(companyName);
  const aliases = buildTickerAliases(normalizedSymbol, companyName, fallback?.aliases ?? []);

  return {
    symbol: normalizedSymbol,
    normalizedSymbol,
    companyName,
    shortName,
    assetType,
    exchange: profileData?.exchange || fallback?.exchange || "",
    sector: profileData?.sector || fallback?.sector || "",
    industry: profileData?.industry || fallback?.industry || "",
    aliases,
    isEtf: assetType.toLowerCase() === "etf" || /\b(etf|trust|fund)\b/i.test(companyName),
    isIndex: assetType.toLowerCase() === "index"
  };
}

export function matchArticleToTicker(article: NormalizedNewsArticle, identity: TickerIdentity): TickerArticleMatch {
  const title = article.title || article.headline;
  const snippet = article.snippet ?? "";
  const category = `${article.category} ${article.primaryCategory} ${article.categories.join(" ")}`;
  const providerTickers = article.relatedTickers.map((ticker) => ticker.toUpperCase());
  const reasons: string[] = [];
  let score = 0;
  const providerMetadataMatch = providerTickers.includes(identity.normalizedSymbol) && hasTrustedTickerMetadata(article);
  const trueCompanyNewsEndpoint = isTrueCompanyNewsEndpoint(article, identity);
  const titleDirectMatch = tickerSymbolMatches(title, identity.normalizedSymbol);
  const titleFullCompanyMatch = textContainsPhrase(title, identity.companyName);
  const titleAlias = identity.aliases.find((alias) => alias.toUpperCase() !== identity.normalizedSymbol && !isWeakTickerAlias(alias) && textContainsPhrase(title, alias));
  const titleStrongAlias = identity.aliases.find((alias) => alias.toUpperCase() !== identity.normalizedSymbol && isStrongTickerAlias(alias, identity) && textContainsPhrase(title, alias));
  const titleHasDirectCompanyMatch = titleDirectMatch || titleFullCompanyMatch || Boolean(titleAlias);
  const titleIndustryAligned = isIndustryAlignedTitle(title, category, identity);
  const incidental = isIncidentalTickerMention(article, identity);
  const subject = detectPrimaryArticleSubject(article, identity);
  const titleOtherCompany = subject.titleMentionsOtherCompany;
  const snippetStrongIdentity = snippetMentionsIdentity(snippet, identity);
  const weakRssOrYahooMetadataOnly = isWeakRssOrYahooArticle(article) && providerTickers.includes(identity.normalizedSymbol) && !titleHasDirectCompanyMatch && !(titleIndustryAligned && snippetStrongIdentity);

  if (trueCompanyNewsEndpoint) {
    score += 120;
    reasons.push("true_company_news_endpoint");
  }

  if (titleDirectMatch) {
    score += 110;
    reasons.push("title contains exact ticker");
  }
  if (titleFullCompanyMatch) {
    score += 100;
    reasons.push("title contains full company name");
  }

  if (titleAlias) {
    score += titleStrongAlias === titleAlias ? 95 : 90;
    reasons.push(`title contains alias: ${titleAlias}`);
  }

  if (providerMetadataMatch && !titleOtherCompany && (titleHasDirectCompanyMatch || titleIndustryAligned || trueCompanyNewsEndpoint)) {
    score += 50;
    reasons.push("provider metadata supports topic match");
  } else if (providerTickers.includes(identity.normalizedSymbol) && !titleHasDirectCompanyMatch && !titleIndustryAligned && !trueCompanyNewsEndpoint) {
    score -= 100;
    reasons.push("provider_tag_without_topic_relevance");
  }

  if (titleIndustryAligned && textContainsPhrase(snippet, identity.companyName)) {
    score += 60;
    reasons.push("snippet contains company name with industry-aligned title");
  }

  if (titleIndustryAligned && tickerSymbolMatches(snippet, identity.normalizedSymbol)) {
    score += 50;
    reasons.push("snippet contains ticker with industry-aligned title");
  }

  if (!titleHasDirectCompanyMatch && !titleIndustryAligned && snippetStrongIdentity) {
    score -= 70;
    reasons.push("snippet_only_unrelated_title");
  }

  if (titleOtherCompany && !titleHasDirectCompanyMatch) {
    score -= 120;
    reasons.push("title_about_other_company");
  }

  if (incidental) {
    score -= 90;
    reasons.push("incidental_or_promotional_mention");
  }

  if (weakRssOrYahooMetadataOnly) {
    score -= 100;
    if (!reasons.includes("provider_tag_without_topic_relevance")) reasons.push("provider_tag_without_topic_relevance");
  }

  if (!titleHasDirectCompanyMatch && !providerMetadataMatch && !titleIndustryAligned) {
    reasons.push("no_provider_or_title_match");
  }

  const etfOrIndexMarketMatch = (identity.isEtf || identity.isIndex) && titleIndustryAligned && !incidental && !titleOtherCompany;
  const matched =
    (trueCompanyNewsEndpoint && (!titleOtherCompany || titleHasDirectCompanyMatch)) ||
    (titleHasDirectCompanyMatch && !incidental && !titleOtherCompany) ||
    etfOrIndexMarketMatch ||
    score >= 90;

  if (!matched && !reasons.some((reason) => reason.includes("provider_tag_without_topic_relevance") || reason.includes("title_about_other_company") || reason.includes("snippet_only_unrelated_title") || reason.includes("incidental_or_promotional_mention"))) {
    reasons.push("weak_match_below_threshold");
  }
  if (!reasons.length) reasons.push("no strong ticker or company identity match");

  return {
    matched,
    score,
    matchedTickers: matched ? [identity.normalizedSymbol] : [],
    relatedTickers: matched ? [identity.normalizedSymbol] : [],
    reasons
  };
}

export function detectPrimaryArticleSubject(article: NormalizedNewsArticle, identity: TickerIdentity): ArticleSubjectDetection {
  const title = article.title || article.headline;
  const reasons: string[] = [];
  const pageTitleMatch =
    tickerSymbolMatches(title, identity.normalizedSymbol) ||
    textContainsPhrase(title, identity.companyName) ||
    identity.aliases.some((alias) => alias.toUpperCase() !== identity.normalizedSymbol && !isWeakTickerAlias(alias) && textContainsPhrase(title, alias));
  const titleMentionsCompanies: string[] = [];
  let primaryCompanyName: string | null = null;
  let primaryTicker: string | null = null;

  for (const [symbol, other] of Object.entries(fallbackTickerIdentity)) {
    const otherName = other.companyName ?? "";
    const otherAliases = [otherName, cleanCompanyName(otherName), ...(other.aliases ?? [])].filter(Boolean);
    const matchesOther = tickerSymbolMatches(title, symbol) || otherAliases.some((alias) => textContainsPhrase(title, alias));
    if (!matchesOther) continue;
    titleMentionsCompanies.push(symbol);
    if (!primaryTicker) {
      primaryTicker = symbol;
      primaryCompanyName = otherName || symbol;
    }
  }

  if (pageTitleMatch) {
    reasons.push("title_mentions_page_ticker");
    if (!primaryTicker) {
      primaryTicker = identity.normalizedSymbol;
      primaryCompanyName = identity.companyName;
    }
  }

  const detectedOtherSubject = pageTitleMatch ? null : detectOtherCompanySubjectFromTitle(title, identity);
  if (detectedOtherSubject) {
    titleMentionsCompanies.push(detectedOtherSubject);
    primaryCompanyName = primaryCompanyName ?? detectedOtherSubject;
    reasons.push(`title_subject_other_company:${detectedOtherSubject}`);
  }

  const titleMentionsOtherCompany = (titleMentionsCompanies.some((symbol) => symbol !== identity.normalizedSymbol) || Boolean(detectedOtherSubject)) && !pageTitleMatch;
  if (titleMentionsOtherCompany) reasons.push("title_mentions_other_company_without_page_ticker");

  return {
    primaryCompanyName,
    primaryTicker,
    titleMentionsCompanies,
    titleMentionsPageTicker: pageTitleMatch,
    titleMentionsOtherCompany,
    reasons
  };
}

function detectOtherCompanySubjectFromTitle(title: string, identity: TickerIdentity) {
  const cleanedTitle = title.replace(/[’']/g, "'");
  const knownOther = knownOtherCompanySubjects.find((name) => textContainsPhrase(cleanedTitle, name) && !identity.aliases.some((alias) => textContainsPhrase(cleanedTitle, alias)));
  if (knownOther) return knownOther;

  const subjectPatterns = [
    /\b(?:why|how|is|are|should|could|will|time to|what's going on with|here's why)\s+([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,3})\s+(?:stock|shares|options|earnings|revenue|sales)\b/,
    /\b([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,3})\s+(?:stock|shares|options)\s+(?:is|are|surges|rises|falls|drops|jumps|trading)\b/,
    /\b(?:loading up on|alarm on|free-cash-flow positive until)\s+([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,3})\b/
  ];

  for (const pattern of subjectPatterns) {
    const match = cleanedTitle.match(pattern);
    const subject = match?.[1]?.trim();
    if (!subject || subject.length < 3) continue;
    if (textContainsPhrase(identity.companyName, subject) || identity.aliases.some((alias) => textContainsPhrase(alias, subject) || textContainsPhrase(subject, alias))) continue;
    if (genericTitleSubjects.has(subject.toLowerCase())) continue;
    return subject;
  }

  return null;
}

function isIncidentalTickerMention(article: NormalizedNewsArticle, identity: TickerIdentity) {
  const title = article.title || article.headline;
  const snippet = article.snippet ?? "";
  const titleHasDirectMatch =
    tickerSymbolMatches(title, identity.normalizedSymbol) ||
    textContainsPhrase(title, identity.companyName) ||
    identity.aliases.some((alias) => alias.toUpperCase() !== identity.normalizedSymbol && textContainsPhrase(title, alias));
  if (titleHasDirectMatch) return false;
  if (!snippetMentionsIdentity(snippet, identity)) return false;

  const text = snippet.toLowerCase();
  return incidentalTickerPhrases.some((phrase) => text.includes(phrase.toLowerCase()));
}

function hasTrustedTickerMetadata(article: NormalizedNewsArticle) {
  const provider = `${article.provider ?? ""} ${article.originalProvider ?? ""}`.toLowerCase();
  return !article.cached && (provider.includes("finnhub") || provider.includes("marketaux") || provider.includes("alpha vantage"));
}

function isTrueCompanyNewsEndpoint(article: NormalizedNewsArticle, identity: TickerIdentity) {
  const provider = `${article.provider ?? ""} ${article.originalProvider ?? ""}`.toLowerCase();
  const source = article.sourceName.toLowerCase();
  if (article.cached) return false;
  if (!article.relatedTickers.map((ticker) => ticker.toUpperCase()).includes(identity.normalizedSymbol)) return false;
  return provider.includes("finnhub") || provider.includes("company news") || source.includes("finnhub");
}

function isWeakRssOrYahooArticle(article: NormalizedNewsArticle) {
  const provider = `${article.provider ?? ""} ${article.originalProvider ?? ""} ${article.sourceName}`.toLowerCase();
  return article.cached || provider.includes("rss") || provider.includes("yahoo");
}

function isStrongTickerAlias(alias: string, identity: TickerIdentity) {
  const normalized = alias.toLowerCase();
  if (identity.normalizedSymbol === "NVDA") return ["jensen huang", "blackwell", "cuda"].includes(normalized);
  if (identity.normalizedSymbol === "MU") return ["micron", "dram", "hbm"].includes(normalized);
  if (identity.normalizedSymbol === "AMD") return ["advanced micro devices", "ryzen", "epyc", "instinct"].includes(normalized);
  if (identity.normalizedSymbol === "PLTR") return ["palantir", "palantir technologies"].includes(normalized);
  return normalized === identity.shortName.toLowerCase();
}

function snippetMentionsIdentity(snippet: string, identity: TickerIdentity) {
  return (
    tickerSymbolMatches(snippet, identity.normalizedSymbol) ||
    textContainsPhrase(snippet, identity.companyName) ||
    identity.aliases.some((alias) => alias.toUpperCase() !== identity.normalizedSymbol && textContainsPhrase(snippet, alias))
  );
}

function isIndustryAlignedTitle(title: string, category: string, identity: TickerIdentity) {
  const text = `${title} ${category}`.toLowerCase();
  if (identity.isEtf || identity.isIndex) {
    return ["stock market", "s&p 500", "nasdaq", "dow", "equities", "wall street", "etf", "index"].some((term) => text.includes(term));
  }

  const sector = `${identity.sector} ${identity.industry}`.toLowerCase();
  const terms = industryTermsForIdentity(identity, sector);
  return terms.some((term) => text.includes(term));
}

function titleCentersAnotherCompany(title: string, identity: TickerIdentity) {
  if (tickerSymbolMatches(title, identity.normalizedSymbol) || textContainsPhrase(title, identity.companyName)) return false;
  return Object.entries(fallbackTickerIdentity).some(([symbol, other]) => {
    if (symbol === identity.normalizedSymbol) return false;
    const otherName = other.companyName ?? "";
    const otherAliases = [otherName, cleanCompanyName(otherName), ...(other.aliases ?? [])].filter(Boolean);
    return tickerSymbolMatches(title, symbol) || otherAliases.some((alias) => textContainsPhrase(title, alias));
  });
}

function industryTermsForIdentity(identity: TickerIdentity, sector: string) {
  const symbol = identity.normalizedSymbol;
  if (["NVDA", "AMD", "MU", "AVGO", "TSM", "ARM"].includes(symbol)) return ["semiconductor", "chip", "gpu", "ai", "data center", "memory", "dram", "hbm"];
  if (symbol === "TSLA") return ["ev", "electric vehicle", "auto", "robotaxi", "battery"];
  if (symbol === "NKE") return ["retail", "apparel", "sneaker", "footwear", "consumer discretionary", "china sales"];
  if (symbol === "RTX") return ["defense", "aerospace", "missile", "pratt", "raytheon", "contract"];
  if (sector.includes("technology")) return ["technology", "software", "cloud", "ai", "semiconductor", "chip"];
  if (sector.includes("consumer")) return ["retail", "consumer", "sales", "brand"];
  if (sector.includes("industrial")) return ["industrial", "aerospace", "defense", "manufacturing"];
  if (sector.includes("financial")) return ["bank", "financial", "credit", "lending"];
  if (sector.includes("energy")) return ["oil", "gas", "energy", "crude"];
  return [identity.shortName.toLowerCase()].filter(Boolean);
}

function isWeakTickerAlias(alias: string) {
  return ["ai chip", "gpu maker", "data center chip", "ev maker", "tech stocks", "u.s. equities", "broad market"].includes(alias.toLowerCase());
}

function buildTickerAliases(symbol: string, companyName: string, overrides: string[]) {
  const aliases = new Set<string>([symbol, companyName]);
  const cleaned = cleanCompanyName(companyName);
  if (cleaned) aliases.add(cleaned);
  const words = cleaned.split(/\s+/).filter((word) => word.length > 2 && !genericAliasWords.has(word.toLowerCase()));
  if (words.length) aliases.add(words.join(" "));
  if (words.length === 1 && words[0].length > 3) aliases.add(words[0]);
  overrides.forEach((alias) => aliases.add(alias));
  return Array.from(aliases).map((alias) => alias.trim()).filter(Boolean);
}

function cleanCompanyName(name: string) {
  return name
    .replace(/\b(incorporated|inc\.?|corporation|corp\.?|company|co\.?|limited|ltd\.?|plc|holdings?|group|class a|common stock|ordinary shares)\b/gi, "")
    .replace(/[,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tickerSymbolMatches(text: string, symbol: string) {
  if (symbol.length <= 2) return false;
  return new RegExp(`(^|[^A-Z0-9])${escapeRegExp(symbol)}([^A-Z0-9]|$)`, "i").test(text);
}

function textContainsPhrase(text: string, phrase: string) {
  const cleaned = phrase.trim();
  if (!cleaned || genericAliasWords.has(cleaned.toLowerCase())) return false;
  return new RegExp(`(^|[^A-Z0-9])${escapeRegExp(cleaned)}([^A-Z0-9]|$)`, "i").test(text);
}

function inferAssetType(symbol: string, companyName: string) {
  if (["SPY", "QQQ", "DIA", "IWM", "GLD", "TLT"].includes(symbol) || /\b(etf|trust|fund)\b/i.test(companyName)) return "ETF";
  return "stock";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const genericAliasWords = new Set([
  "the",
  "united",
  "american",
  "global",
  "international",
  "holdings",
  "group",
  "technologies",
  "technology",
  "energy",
  "capital",
  "financial",
  "corp",
  "corporation",
  "inc",
  "company",
  "common",
  "stock"
]);

const incidentalTickerPhrases = [
  "missed out on",
  "back in 2009",
  "next nvidia",
  "next tesla",
  "next apple",
  "like nvidia",
  "like tesla",
  "better than nvidia",
  "better than tesla",
  "if you invested",
  "turned $1,000 into",
  "turned $1000 into",
  "millionaire-maker",
  "motley fool recommends",
  "our top stock picks",
  "buy these stocks instead",
  "forget nvidia",
  "forget tesla",
  "this stock could be",
  "once-in-a-generation",
  "artificial promo text",
  "disclosure:",
  "affiliate",
  "sponsored",
  "advertisement"
];

const knownOtherCompanySubjects = [
  "Archer Aviation",
  "Beyond Meat",
  "Penn Entertainment",
  "SpaceX",
  "Nike",
  "RTX",
  "Caterpillar",
  "Netflix",
  "Disney",
  "Boeing",
  "Exxon",
  "Chevron",
  "JPMorgan",
  "Amazon",
  "Meta",
  "Google",
  "Alphabet"
];

const genericTitleSubjects = new Set([
  "stock",
  "stocks",
  "shares",
  "market",
  "markets",
  "wall street",
  "s&p",
  "nasdaq",
  "dow",
  "ai",
  "chip",
  "chips",
  "semiconductor",
  "semiconductors"
]);

const fallbackTickerIdentity: Record<string, Partial<TickerIdentity> & { aliases?: string[]; companyName?: string }> = {
  NVDA: { companyName: "NVIDIA Corporation", assetType: "stock", sector: "Technology", aliases: ["NVIDIA", "Jensen Huang", "Blackwell", "CUDA", "GPU maker", "AI chip", "data center chip"] },
  AAPL: { companyName: "Apple Inc.", assetType: "stock", sector: "Technology", aliases: ["Apple", "iPhone", "Mac", "Tim Cook"] },
  MSFT: { companyName: "Microsoft Corporation", assetType: "stock", sector: "Technology", aliases: ["Microsoft", "Azure", "Satya Nadella", "Copilot"] },
  TSLA: { companyName: "Tesla Inc.", assetType: "stock", sector: "Consumer Cyclical", aliases: ["Tesla", "Elon Musk", "Model Y", "EV maker"] },
  MU: { companyName: "Micron Technology Inc.", assetType: "stock", sector: "Technology", aliases: ["Micron", "DRAM", "HBM", "memory chip"] },
  AMD: { companyName: "Advanced Micro Devices Inc.", assetType: "stock", sector: "Technology", aliases: ["Advanced Micro Devices", "Ryzen", "EPYC", "Instinct"] },
  PLTR: { companyName: "Palantir Technologies Inc.", assetType: "stock", sector: "Technology", aliases: ["Palantir", "Palantir Technologies"] },
  NKE: { companyName: "Nike Inc.", assetType: "stock", sector: "Consumer Cyclical", aliases: ["Nike"] },
  RTX: { companyName: "RTX Corporation", assetType: "stock", sector: "Industrials", aliases: ["RTX", "Raytheon"] },
  SPY: { companyName: "SPDR S&P 500 ETF Trust", assetType: "ETF", aliases: ["S&P 500", "U.S. equities", "Wall Street", "broad market"] },
  QQQ: { companyName: "Invesco QQQ Trust", assetType: "ETF", aliases: ["Nasdaq 100", "Nasdaq", "tech stocks"] }
};

function isClearlyUnrelatedToMarkets(text: string) {
  const nonMarketTerms = [
    "resume",
    "recruiter",
    "hiring manager",
    "job interview",
    "career advice",
    "salary negotiation",
    "workplace",
    "pixel phone",
    "android phone",
    "chrome beta",
    "wireless charging",
    "smartphone",
    "quit his",
    "job package",
    "audio",
    "celebrity",
    "movie",
    "tv show",
    "sports",
    "recipe"
  ];
  const marketOverrideTerms = [
    "stock",
    "shares",
    "market",
    "earnings",
    "revenue",
    "profit",
    "inflation",
    "fed",
    "interest rates",
    "oil",
    "gold",
    "treasury",
    "yield",
    "ai",
    "semiconductor",
    "analyst",
    "upgrade",
    "downgrade",
    "ipo",
    "merger",
    "acquisition"
  ];

  return nonMarketTerms.some((term) => text.includes(term)) && !marketOverrideTerms.some((term) => text.includes(term));
}

const marketRelevanceKeywords = [
  "stock",
  "stocks",
  "shares",
  "equities",
  "wall street",
  "wall st",
  "s&p 500",
  "nasdaq",
  "dow",
  "nyse",
  "russell 2000",
  "market rally",
  "selloff",
  "premarket",
  "after hours",
  "nvidia",
  "apple",
  "microsoft",
  "tesla",
  "amazon",
  "meta",
  "google",
  "alphabet",
  "amd",
  "micron",
  "broadcom",
  "jpmorgan",
  "exxon",
  "earnings",
  "revenue",
  "eps",
  "profit",
  "sales",
  "guidance",
  "quarterly results",
  "beat",
  "miss",
  "margins",
  "analyst estimate",
  "federal reserve",
  "fed",
  "fomc",
  "powell",
  "central banker",
  "central bank",
  "ecb",
  "cpi",
  "pce",
  "inflation",
  "jobs report",
  "unemployment",
  "gdp",
  "recession",
  "consumer spending",
  "treasury yields",
  "interest rates",
  "rate cut",
  "rate hike",
  "futures",
  "index futures",
  "oil",
  "crude",
  "wti",
  "brent",
  "natural gas",
  "gold",
  "silver",
  "copper",
  "opec",
  "energy prices",
  "ai",
  "artificial intelligence",
  "chips",
  "semiconductor",
  "semiconductors",
  "gpu",
  "data center",
  "memory",
  "dram",
  "hbm",
  "foundry",
  "bitcoin",
  "ethereum",
  "crypto",
  "bond market",
  "treasuries",
  "fixed income",
  "yields",
  "upgrade",
  "downgrade",
  "price target",
  "analyst",
  "rating",
  "merger",
  "acquisition",
  "ipo",
  "buyback",
  "dividend",
  "bank",
  "banks",
  "insurance",
  "reinsurance",
  "roe",
  "underwriting",
  "premiums",
  "claims",
  "credit",
  "loans",
  "financials",
  "profitability",
  "investing",
  "investor",
  "investors",
  "portfolio",
  "valuation",
  "etf",
  "fund"
];

function keywordMatches(text: string, keyword: string) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundaryStart = /^[a-z0-9]/i.test(keyword) ? "\\b" : "";
  const boundaryEnd = /[a-z0-9]$/i.test(keyword) ? "\\b" : "";
  return new RegExp(`${boundaryStart}${escaped}${boundaryEnd}`, "i").test(text);
}

function parseRssItems(xml: string, sourceName: string) {
  const itemMatches = Array.from(xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)).map((match) => match[0]);
  return itemMatches.map((item) => {
    const title = decodeXmlText(readXmlField(item, "title"));
    const url = decodeXmlText(readXmlField(item, "link") || readXmlField(item, "guid"));
    const pubDate = decodeXmlText(readXmlField(item, "pubDate") || readXmlField(item, "published") || readXmlField(item, "updated"));
    const author = decodeXmlText(readXmlField(item, "author") || readXmlField(item, "dc:creator"));
    const description = decodeXmlText(stripHtml(readXmlField(item, "description") || readXmlField(item, "content:encoded")));
    const parsedDate = pubDate ? new Date(pubDate) : null;

    return {
      title,
      url,
      sourceName,
      author,
      publishedAt: parsedDate && Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : "",
      snippet: description
    };
  });
}

function readXmlField(xml: string, field: string) {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${escapedField}[^>]*>([\\s\\S]*?)<\\/${escapedField}>`, "i"));
  return match?.[1]?.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim() ?? "";
}

function decodeXmlText(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseAlphaVantageNewsTime(value: string) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!match) return "";
  const [, year, month, day, hour, minute, second] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))).toISOString();
}

function providerHealthForResult<T>(result: AttemptResult<T>): NewsProviderDebugMeta["providerHealth"][string] {
  if (result.error) return result.error.includes("not configured") ? "missing" : "error";
  if (result.data && (!Array.isArray(result.data) || result.data.length)) return "ok";
  return "empty";
}

function addRejectedArticle(list: NewsProviderDebugMeta["firstRejectedArticles"], article: NormalizedNewsArticle, reason: string) {
  if (list.length >= 8) return;
  list.push({ title: article.title, source: article.sourceName, reason });
}

function buildNewsDebugMeta({
  merged,
  sources,
  providerCounts,
  acceptedCounts,
  rejectedCounts,
  providerHealth,
  providerHealthExtras,
  rejectedReasons,
  firstRejectedArticles,
  dedupedCount,
  liveProviderArticleCount,
  cachedArticleCount,
  totalArticlesBeforeFiltering,
  totalArticlesAfterFiltering,
  totalArticlesAfterMerge
}: {
  merged: NormalizedNewsArticle[];
  sources: Set<string>;
  providerCounts: Record<string, number>;
  acceptedCounts: Record<string, number>;
  rejectedCounts: Record<string, number>;
  providerHealth: NewsProviderDebugMeta["providerHealth"];
  providerHealthExtras: Record<string, unknown>;
  rejectedReasons: Record<string, number>;
  firstRejectedArticles: NewsProviderDebugMeta["firstRejectedArticles"];
  dedupedCount: number;
  liveProviderArticleCount: number;
  cachedArticleCount: number;
  totalArticlesBeforeFiltering: number;
  totalArticlesAfterFiltering: number;
  totalArticlesAfterMerge: number;
}): NewsProviderDebugMeta {
  const sorted = [...merged].sort(sortNewsNewestFirst);
  return {
    liveProviderArticleCount,
    cachedArticleCount,
    totalArticlesBeforeFiltering,
    totalArticlesAfterFiltering,
    totalArticlesAfterMerge,
    providersUsed: Array.from(sources),
    providerHealth: { ...providerHealth, ...providerHealthExtras },
    providerCounts,
    rssSourceHealth: providerHealthExtras.RSS,
    acceptedCounts,
    rejectedCounts,
    rejectedReasons,
    firstRejectedArticles,
    dedupedCount,
    bucketCounts: countStrings(merged.map((article) => article.localDateBucket)),
    categoryCounts: countStrings(merged.flatMap((article) => article.categories.length ? article.categories : [article.primaryCategory])),
    newestArticleAt: sorted[0]?.publishedAt ?? null,
    oldestArticleAt: sorted.at(-1)?.publishedAt ?? null,
    cacheUsed: cachedArticleCount > 0
  };
}

function emptyNewsMeta(): NewsProviderDebugMeta {
  return {
    liveProviderArticleCount: 0,
    cachedArticleCount: 0,
    totalArticlesBeforeFiltering: 0,
    totalArticlesAfterFiltering: 0,
    totalArticlesAfterMerge: 0,
    providersUsed: [],
    providerHealth: {},
    providerCounts: {},
    acceptedCounts: {},
    rejectedCounts: {},
    rejectedReasons: {},
    firstRejectedArticles: [],
    dedupedCount: 0,
    bucketCounts: {},
    categoryCounts: {},
    newestArticleAt: null,
    oldestArticleAt: null,
    cacheUsed: false
  };
}

function countStrings(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function missingNewsFragments() {
  return [
    "Guy Carpenter expects reinsurance industry",
    "Inflation likely to stay significantly above target",
    "As The Playing Field Expands"
  ];
}

function traceMatchingArticles(
  articles: NormalizedNewsArticle[],
  fragments: string[],
  todayFinal: NormalizedNewsArticle[],
  sevenDayFinal: NormalizedNewsArticle[]
): NewsTraceArticle[] {
  return articles.flatMap((article) => {
    const matchedFragment = matchedNewsFragment(article, fragments);
    if (!matchedFragment) return [];
    return [buildTraceArticle(article, matchedFragment, todayFinal, sevenDayFinal)];
  });
}

function buildTraceLifecycle(range: "today" | "7d", payload: ProviderPayload<NormalizedNewsArticle[]>, fragments: string[]): NewsTraceLifecycle {
  const data = payload.data ?? [];
  return {
    range,
    totalArticles: data.length,
    source: payload.source,
    status: payload.status,
    matchedFinalArticles: traceMatchingArticles(data, fragments, data, data),
    meta: payload.meta
  };
}

function matchedNewsFragment(article: NormalizedNewsArticle, fragments: string[]) {
  const haystack = `${article.title} ${article.headline} ${article.sourceName} ${article.url} ${article.snippet}`.toLowerCase();
  return fragments.find((fragment) => haystack.includes(fragment.toLowerCase())) ?? null;
}

function buildTraceArticle(
  article: NormalizedNewsArticle,
  matchedFragment: string,
  todayFinal: NormalizedNewsArticle[],
  sevenDayFinal: NormalizedNewsArticle[]
): NewsTraceArticle {
  const todayRangeStart = newsRangeStart("today");
  const sevenDayRangeStart = newsRangeStart("7d");
  const articleDate = new Date(article.publishedAt);
  const passedToday = articleDate >= todayRangeStart;
  const passedSevenDay = articleDate >= sevenDayRangeStart;
  const passedRelevance = isMarketRelevantArticle(article);
  const todayDedupe = dedupeTraceStatus(article, todayFinal, passedToday, passedRelevance);
  const sevenDayDedupe = dedupeTraceStatus(article, sevenDayFinal, passedSevenDay, passedRelevance);
  const rejectedReason = !passedToday && !passedSevenDay ? "outside_range" : !passedRelevance ? "not_market_relevant" : null;

  return {
    title: article.title,
    source: article.sourceName,
    url: article.url,
    publishedAt: article.publishedAt,
    publishedLocalTime: article.publishedLocalTime,
    matchedFragment,
    passedDateFilter: {
      today: passedToday,
      sevenDay: passedSevenDay
    },
    passedRelevanceFilter: passedRelevance,
    rejectedReason,
    dedupeStatus: {
      today: todayDedupe.status,
      sevenDay: sevenDayDedupe.status,
      duplicateOf: todayDedupe.duplicateOf ?? sevenDayDedupe.duplicateOf
    }
  };
}

function dedupeTraceStatus(
  article: NormalizedNewsArticle,
  finalArticles: NormalizedNewsArticle[],
  passedRange: boolean,
  passedRelevance: boolean
): { status: NewsTraceArticle["dedupeStatus"]["today"]; duplicateOf?: string } {
  if (!passedRange) return { status: "not_in_range" };
  if (!passedRelevance) return { status: "not_relevant" };
  const finalMatch = finalArticles.find((candidate) => sameNewsArticle(candidate, article));
  if (finalMatch) return { status: "accepted" };
  const duplicate = finalArticles.find((candidate) => canonicalNewsUrl(candidate.url) === canonicalNewsUrl(article.url) || normalizeNewsTitle(candidate.title) === normalizeNewsTitle(article.title));
  if (duplicate) return { status: "removed_by_dedupe", duplicateOf: duplicate.title };
  return { status: "not_in_final" };
}

function sameNewsArticle(left: NormalizedNewsArticle, right: NormalizedNewsArticle) {
  return canonicalNewsUrl(left.url) === canonicalNewsUrl(right.url) || normalizeNewsTitle(left.title) === normalizeNewsTitle(right.title);
}

function inferRelatedTickers(text: string) {
  const candidates = ["NVDA", "AMD", "MU", "TSLA", "AAPL", "MSFT", "QQQ", "SPY", "DIA", "IWM", "TLT", "USO", "GLD", "ES", "NQ", "YM", "RTY", "CL", "GC", "ZN"];
  const upperText = text.toUpperCase();
  return candidates.filter((symbol) => new RegExp(`\\b${symbol}\\b`).test(upperText));
}

function fundamental(metric: string, value: string, context: string): NormalizedFundamental {
  return { metric, value, context };
}

function valueFrom(value: unknown) {
  const number = numberFrom(value);
  return number === null ? "Unavailable" : number.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function currencyFrom(value: unknown) {
  const number = numberFrom(value);
  if (number === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(number) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(number) >= 1_000_000 ? 2 : 0
  }).format(number);
}

function percentValue(value: number | null) {
  return value === null ? "Unavailable" : `${(value * 100).toFixed(2)}%`;
}

function ratioValue(value: unknown) {
  const number = numberFrom(value);
  return number === null ? "Unavailable" : number.toFixed(2);
}

function numberDisplay(value: unknown) {
  const number = numberFrom(value);
  return number === null ? "Unavailable" : number.toLocaleString("en-US", { notation: number >= 1_000_000 ? "compact" : "standard", maximumFractionDigits: 2 });
}

function margin(numerator: unknown, denominator: unknown) {
  const top = numberFrom(numerator);
  const bottom = numberFrom(denominator);
  if (top === null || bottom === null || bottom === 0) return null;
  return top / bottom;
}

function calculateTechnicals(candles: NormalizedCandle[]): NormalizedTechnical[] {
  const closes = candles.map((candle) => candle.close).filter(Number.isFinite);
  const volumes = candles.map((candle) => candle.volume).filter(Number.isFinite);
  const latest = closes.at(-1);

  if (!latest || closes.length < 50) return [];

  const rsi = calculateRsi(closes, 14);
  const sma20 = average(closes.slice(-20));
  const sma50 = average(closes.slice(-50));
  const sma200 = closes.length >= 200 ? average(closes.slice(-200)) : null;
  const macd = calculateMacd(closes);
  const averageVolume = volumes.length >= 20 ? average(volumes.slice(-20)) : null;
  const latestVolume = volumes.at(-1) ?? null;

  return [
    {
      label: "RSI 14D",
      value: rsi === null ? "Unavailable" : rsi.toFixed(1),
      signal: rsi === null ? "Data unavailable" : rsi > 70 ? "Extended" : rsi < 30 ? "Oversold" : "Neutral"
    },
    {
      label: "MACD",
      value: macd === null ? "Unavailable" : macd.toFixed(2),
      signal: macd === null ? "Data unavailable" : macd > 0 ? "Positive momentum" : "Negative momentum"
    },
    {
      label: "20D MA",
      value: sma20 === null ? "Unavailable" : `$${sma20.toFixed(2)}`,
      signal: sma20 !== null && latest > sma20 ? "Price above short trend" : "Price below short trend"
    },
    {
      label: "50D MA",
      value: sma50 === null ? "Unavailable" : `$${sma50.toFixed(2)}`,
      signal: sma50 !== null && latest > sma50 ? "Price above intermediate trend" : "Price below intermediate trend"
    },
    {
      label: "200D MA",
      value: sma200 === null ? "Unavailable" : `$${sma200.toFixed(2)}`,
      signal: sma200 === null ? "Data unavailable" : latest > sma200 ? "Price above long trend" : "Price below long trend"
    },
    {
      label: "Volume",
      value: latestVolume !== null && averageVolume ? `${(latestVolume / averageVolume).toFixed(2)}x avg` : "Unavailable",
      signal: latestVolume !== null && averageVolume && latestVolume > averageVolume * 1.5 ? "Elevated participation" : "Normal participation"
    }
  ];
}

function calculateRsi(closes: number[], period: number) {
  if (closes.length <= period) return null;
  const slice = closes.slice(-(period + 1));
  let gains = 0;
  let losses = 0;

  for (let index = 1; index < slice.length; index += 1) {
    const diff = slice[index] - slice[index - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  if (losses === 0) return 100;
  const rs = gains / period / (losses / period);
  return 100 - 100 / (1 + rs);
}

function calculateMacd(closes: number[]) {
  if (closes.length < 26) return null;
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  if (fast === null || slow === null) return null;
  return fast - slow;
}

function ema(values: number[], period: number) {
  if (values.length < period) return null;
  const multiplier = 2 / (period + 1);
  return values.slice(1).reduce((current, value) => (value - current) * multiplier + current, average(values.slice(0, period)) ?? values[0]);
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function normalizeInterval(interval?: string) {
  const value = (interval ?? "1d").toLowerCase();
  if (["1m", "1min"].includes(value)) return "1min";
  if (["5m", "5min"].includes(value)) return "5min";
  if (["15m", "15min"].includes(value)) return "15min";
  if (["30m", "30min"].includes(value)) return "30min";
  if (["1h", "60m", "60min"].includes(value)) return "1hour";
  if (["4h", "240m", "240min"].includes(value)) return "4hour";
  return "1day";
}

function historyDays(range?: string) {
  const value = (range ?? "1Y").toLowerCase();
  if (value === "1d") return 2;
  if (value === "5d") return 7;
  if (value === "1m") return 31;
  if (value === "3m") return 93;
  if (value === "6m") return 186;
  if (value === "ytd") return Math.max(1, Math.ceil((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 1)) / 86_400_000));
  if (value === "5y") return 365 * 5;
  return 370;
}

function historyLimit(range?: string) {
  return Math.min(1250, Math.max(30, historyDays(range)));
}

function newsLimit(limit?: number) {
  if (!limit || !Number.isFinite(limit)) return 30;
  return Math.min(100, Math.max(1, Math.floor(limit)));
}

function newsFromDate(range?: string) {
  return newsRangeStart(range).toISOString();
}

function newsRangeStart(range?: string) {
  return getRangeStart(range, NEWS_TIMEZONE);
}

function fmpIntradayInterval(interval: string) {
  const map: Record<string, string> = {
    "1min": "1min",
    "5min": "5min",
    "15min": "15min",
    "30min": "30min",
    "1hour": "1hour",
    "4hour": "4hour"
  };
  return map[interval];
}

function alphaVantageInterval(interval: string) {
  const map: Record<string, string> = {
    "1min": "1min",
    "5min": "5min",
    "15min": "15min",
    "30min": "30min",
    "1hour": "60min"
  };
  return map[interval];
}

function twelveDataInterval(interval: string) {
  const map: Record<string, string> = {
    "1min": "1min",
    "5min": "5min",
    "15min": "15min",
    "30min": "30min",
    "1hour": "1h",
    "4hour": "4h",
    "1day": "1day"
  };
  return map[interval] ?? "1day";
}

function alpacaTimeframe(interval: string) {
  const map: Record<string, string> = {
    "1min": "1Min",
    "5min": "5Min",
    "15min": "15Min",
    "30min": "30Min",
    "1hour": "1Hour",
    "4hour": "4Hour",
    "1day": "1Day"
  };
  return map[interval] ?? "1Day";
}
