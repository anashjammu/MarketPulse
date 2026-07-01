"use client";

import { useEffect, useMemo, useState } from "react";
import { SimpleLocalTime } from "@/components/LocalTime";
import { LiveMarketSearch } from "@/components/LiveMarketSearch";
import { Panel } from "@/components/Panel";
import { TickerLink } from "@/components/TickerLink";
import type { EconomicCalendarItem, MarketBrief, NewsImpact, NewsItem, NewsSentiment } from "@/lib/news-service";
import { cn } from "@/lib/utils";

const feedCategories = ["All", "AI", "Earnings", "Semiconductors", "Macro", "Fed", "Yields", "Stocks", "Futures", "Energy", "Metals", "Crypto", "Bonds", "Analyst Ratings", "Geopolitics", "Finance"];
const articleFilters = feedCategories;
const rangeFilters = ["Today", "7D"];

type NewsStatus = {
  source: string;
  status: string;
  delay: string;
  updatedAt: string;
  range: string;
  count: number;
};

export function LiveMarketFeedHub({
  feedItems,
  breakingItems,
  articleItems,
  calendarItems,
  marketBrief,
  newsStatus
}: {
  feedItems: NewsItem[];
  breakingItems: NewsItem[];
  articleItems: NewsItem[];
  calendarItems: EconomicCalendarItem[];
  marketBrief: MarketBrief;
  newsStatus: NewsStatus;
}) {
  const [articleFilter, setArticleFilter] = useState("All");
  const [articleQuery, setArticleQuery] = useState("");
  const [dateRange, setDateRange] = useState("Today");
  const [articleState, setArticleState] = useState(articleItems);
  const [statusState, setStatusState] = useState(newsStatus);
  const [page, setPage] = useState(1);
  const [loadingNews, setLoadingNews] = useState(false);

  const filteredArticles = useMemo(() => filterByRange(filterArticles(articleState, articleFilter, articleQuery), dateRange), [articleFilter, articleState, articleQuery, dateRange]);
  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(filteredArticles.length / pageSize));
  const pagedArticles = useMemo(() => filteredArticles.slice((page - 1) * pageSize, page * pageSize), [filteredArticles, page]);

  useEffect(() => {
    setPage(1);
  }, [articleFilter, articleQuery, dateRange]);

  useEffect(() => {
    const controller = new AbortController();
    const range = rangeParam(dateRange);
    setLoadingNews(true);

    fetch(`/api/news/market?range=${range}&limit=100`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        const articles: NewsItem[] = Array.isArray(payload.data) ? payload.data.map(apiArticleToNewsItem).sort(sortNewestFirst) : [];
        setArticleState(articles.map((item: NewsItem) => ({ ...item, type: "article" })));
        setStatusState({
          source: payload.source ?? "Unavailable",
          status: articles.length ? labelNewsStatus(payload.status) : "Unavailable",
          delay: payload.delay ?? "N/A",
          updatedAt: payload.updatedAt ?? new Date().toISOString(),
          range: dateRange,
          count: articles.length
        });
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setStatusState((current) => ({ ...current, status: "Unavailable", count: 0 }));
          setArticleState([]);
        }
      })
      .finally(() => setLoadingNews(false));

    return () => controller.abort();
  }, [dateRange]);

  return (
    <div className="grid gap-3">
      <Panel title="Search">
        <LiveMarketSearch />
      </Panel>

      <Panel title="Articles" action={<NewsStatusLine status={statusState} loading={loadingNews} />}>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <FilterBar items={rangeFilters} value={dateRange} onChange={setDateRange} />
            <FilterBar items={articleFilters} value={articleFilter} onChange={setArticleFilter} />
          </div>
          <input
            value={articleQuery}
            onChange={(event) => setArticleQuery(event.target.value)}
            placeholder="Search articles, sources, or tickers"
            className="terminal-input"
          />
          <div className="grid gap-3 lg:grid-cols-2">
            {pagedArticles.length ? <GroupedArticles items={pagedArticles} range={dateRange} /> : <EmptyState message={loadingNews ? "Loading latest articles..." : "No articles found"} />}
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] pt-3">
              <span className="text-xs text-terminal-muted">Page {page} of {totalPages}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-white/[0.12] bg-white/[0.03] px-3 py-1.5 text-xs text-terminal-text transition disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-white/[0.12] bg-white/[0.03] px-3 py-1.5 text-xs text-terminal-text transition disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

function BreakingNewsStrip({ item }: { item: NewsItem }) {
  return (
    <div className="rounded-xl border border-terminal-red/20 bg-white/[0.06] p-3">
      <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
        <span className="rounded-md border border-terminal-red/25 bg-white/[0.045] px-3 py-1 uppercase tracking-[0.12em] text-terminal-red">Breaking</span>
        <SimpleLocalTime value={item.publishedAt} timestampValid={item.timestampValid} />
        <span className="text-terminal-muted">{item.sourceName}</span>
        <TickerList symbols={item.relatedTickers} />
      </div>
      <div className="mt-2 text-sm font-semibold text-terminal-text">{item.headline}</div>
    </div>
  );
}

function MarketTonePanel({ brief }: { brief: MarketBrief }) {
  return (
    <Panel title="Market Tone" action={<span className="font-mono text-xs text-terminal-cyan">{brief.tone}</span>}>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
        <p className="text-sm leading-6 text-terminal-text lg:col-span-3">{brief.whyStocksMove}</p>
        <ToneList title="Main Drivers" items={brief.watchNext.slice(0, 3)} />
        <ToneList title="Sectors Leading" items={brief.leadingSectors} />
        <ToneList title="Sectors Lagging" items={brief.weakSectors} />
      </div>
    </Panel>
  );
}

function ToneList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.045] p-3">
      <div className="font-mono text-xs uppercase tracking-[0.12em] text-terminal-muted">{title}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-md border border-white/10 bg-white/[0.045] px-2.5 py-1 text-xs text-terminal-text">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function FeedRow({ item }: { item: NewsItem }) {
  return (
    <div className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-xs xl:grid-cols-[90px_1fr_120px_140px_120px_90px] xl:items-center">
      <span className="font-mono text-terminal-cyan"><SimpleLocalTime value={item.publishedAt} timestampValid={item.timestampValid} /></span>
      <div>
        <div className="text-sm font-medium text-terminal-text">{item.headline}</div>
        <details className="mt-1 text-terminal-muted">
          <summary className="cursor-pointer text-terminal-cyan">Why it matters</summary>
          <p className="mt-1 leading-5">{item.whyItMatters}</p>
        </details>
      </div>
      <span className="text-terminal-muted">{item.sourceName}</span>
      <span className="text-terminal-muted">{item.category}</span>
      <TickerList symbols={item.relatedTickers} />
      <div className="flex flex-wrap gap-2">
        {item.sentiment ? <SentimentPill sentiment={item.sentiment} /> : null}
        <a href={item.url} target="_blank" rel="noreferrer" className="text-terminal-cyan underline-offset-4 hover:underline">Read</a>
      </div>
    </div>
  );
}

function GroupedFeed({ items, range }: { items: NewsItem[]; range: string }) {
  return (
    <div className="grid gap-3">
      {newsGroups(items, range).map((group) => (
        <section key={group.title} className="grid gap-1.5">
          <div className="font-mono text-xs uppercase tracking-[0.12em] text-terminal-muted">{group.title}</div>
          {group.items.map((item) => <FeedRow key={item.id} item={item} />)}
        </section>
      ))}
    </div>
  );
}

function ArticleCard({ item }: { item: NewsItem }) {
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.045] p-4">
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-terminal-muted">
        <SimpleLocalTime value={item.publishedAt} timestampValid={item.timestampValid} />
        <span aria-hidden="true">·</span>
        <span>{item.sourceName}</span>
        <span aria-hidden="true">·</span>
        <span>{item.category}</span>
      </div>
      <h3 className="mt-3 text-[1.02rem] font-semibold leading-6 tracking-[-0.01em] text-terminal-text">{item.headline}</h3>
      {item.snippet ? <p className="mt-2 text-sm leading-6 text-terminal-muted">{item.snippet}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <TickerList symbols={item.relatedTickers} />
        <a href={item.url} target="_blank" rel="noreferrer" className="rounded-lg border border-terminal-cyan/25 px-3 py-1.5 text-terminal-cyan transition hover:border-terminal-cyan/50">
          Read original article
        </a>
      </div>
    </article>
  );
}

function GroupedArticles({ items, range }: { items: NewsItem[]; range: string }) {
  return (
    <div className="grid gap-3 lg:col-span-2">
      {newsGroups(items, range).map((group) => (
        <section key={group.title} className="grid gap-3">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-terminal-muted">{group.title}</div>
          <div className="grid gap-3 lg:grid-cols-2">
            {group.items.map((item) => <ArticleCard key={item.id} item={item} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function FilterBar({ items, value, onChange }: { items: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs transition",
            value === item ? "border-terminal-cyan/35 bg-terminal-cyan/[0.12] text-terminal-cyan" : "border-white/10 bg-white/[0.03] text-terminal-muted hover:border-white/20 hover:text-terminal-text"
          )}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function NewsStatusLine({ status, loading }: { status: NewsStatus; loading: boolean }) {
  if (loading) return <span className="font-mono text-xs text-terminal-cyan">Loading latest articles...</span>;
  if (!status.count) return <span className="font-mono text-xs text-terminal-amber">News unavailable</span>;
  return <span className="text-xs text-terminal-muted">Latest market-related updates</span>;
}

function apiArticleToNewsItem(article: {
  id?: string;
  headline?: string;
  title?: string;
  sourceName?: string;
  author?: string;
  url?: string;
  publishedAt?: string;
  publishedLocalTime?: string;
  localDateBucket?: string;
  primaryCategory?: string;
  categories?: string[];
  category?: string;
  relatedTickers?: string[];
  sentiment?: string;
  impactLevel?: string;
  snippet?: string;
  timestampValid?: boolean;
  timestampWarning?: string;
}): NewsItem {
  return {
    id: article.id ?? article.url ?? article.headline ?? crypto.randomUUID(),
    type: "feed",
    headline: article.headline ?? article.title ?? "Untitled article",
    sourceName: article.sourceName ?? "Provider",
    author: article.author,
    url: article.url ?? "#",
    publishedAt: article.publishedAt ?? new Date().toISOString(),
    publishedLocalTime: article.publishedLocalTime,
    localDateBucket: article.localDateBucket,
    primaryCategory: article.primaryCategory ?? article.category ?? "Market",
    categories: article.categories?.length ? article.categories : [article.primaryCategory ?? article.category ?? "Market"],
    relatedTickers: Array.isArray(article.relatedTickers) ? article.relatedTickers : [],
    category: article.primaryCategory ?? article.category ?? "Market",
    snippet: article.snippet ?? "",
    sentiment: normalizeSentiment(article.sentiment),
    impactLevel: normalizeImpact(article.impactLevel),
    whyItMatters: "This real article may affect market tone, sector sentiment, or ticker-specific research context.",
    timestampValid: article.timestampValid,
    timestampWarning: article.timestampWarning
  };
}

function buildBriefFromNews(items: NewsItem[]): MarketBrief {
  if (!items.length) {
    return {
      tone: "Data unavailable",
      whyStocksMove: "News unavailable from configured providers.",
      leadingSectors: [],
      weakSectors: [],
      watchNext: []
    };
  }

  return {
    tone: "Neutral",
    whyStocksMove: "Market tone is based on latest provider news. Quote/sector confirmation unavailable.",
    leadingSectors: Array.from(new Set(items.flatMap((item) => item.relatedTickers))).slice(0, 4),
    weakSectors: [],
    watchNext: Array.from(new Set(items.map((item) => String(item.category)))).slice(0, 4)
  };
}

function normalizeSentiment(sentiment?: string): NewsSentiment | undefined {
  if (!sentiment) return undefined;
  const normalized = sentiment.toLowerCase();
  if (normalized.includes("bull") || normalized.includes("positive")) return "Bullish";
  if (normalized.includes("bear") || normalized.includes("negative")) return "Bearish";
  if (normalized.includes("neutral")) return "Neutral";
  return undefined;
}

function normalizeImpact(impact?: string): NewsImpact | undefined {
  if (impact === "Low" || impact === "Medium" || impact === "High") return impact;
  return "Medium";
}

function labelNewsStatus(status?: string) {
  if (status === "partial") return "Partial real news feed";
  if (status === "delayed") return "Delayed real news feed";
  if (status === "cached") return "Cached real news feed";
  return status ?? "Real news feed";
}

function filterByRange(items: NewsItem[], range: string) {
  if (range === "Today") return items.filter((item) => (item.localDateBucket ?? bucketFromDate(item.publishedAt)) === "today");
  const cutoff = Date.now() - rangeDays(range) * 24 * 60 * 60 * 1000;
  return items.filter((item) => new Date(item.publishedAt).getTime() >= cutoff).sort(sortNewestFirst);
}

function rangeDays(range: string) {
  if (range === "Today") return 1;
  if (range === "3D") return 3;
  if (range === "30D") return 30;
  return 7;
}

function rangeParam(range: string) {
  if (range === "Today") return "today";
  if (range === "3D") return "3d";
  if (range === "30D") return "30d";
  return "7d";
}

function TickerList({ symbols }: { symbols: string[] }) {
  if (!symbols.length) return null;
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

function ImpactPill({ impact }: { impact: NewsImpact }) {
  const className =
    impact === "High"
      ? "border-terminal-red/25 text-terminal-red"
      : impact === "Medium"
        ? "border-terminal-amber/25 text-terminal-amber"
        : "border-white/10 text-terminal-muted";

  return <span className={cn("inline-flex rounded-md border bg-white/[0.045] px-2.5 py-1 font-mono text-xs", className)}>{impact}</span>;
}

function SentimentPill({ sentiment }: { sentiment: NewsSentiment }) {
  const className =
    sentiment === "Bullish"
      ? "border-terminal-green/25 text-terminal-green"
      : sentiment === "Bearish"
        ? "border-terminal-red/25 text-terminal-red"
        : "border-terminal-cyan/25 text-terminal-cyan";

  return <span className={cn("inline-flex rounded-md border bg-white/[0.045] px-2.5 py-1 font-mono text-xs", className)}>{sentiment}</span>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-lg border border-white/10 bg-white/[0.045] p-6 text-sm text-terminal-muted">{message}</div>;
}

function filterFeed(items: NewsItem[], category: string) {
  if (category === "All") return items;
  return items.filter((item) => articleCategories(item).includes(category));
}

function filterArticles(items: NewsItem[], filter: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = filter === "All" ? items : items.filter((item) => articleCategories(item).includes(filter));

  if (!normalizedQuery) return filtered;

  return filtered.filter((item) => {
    const text = `${item.headline} ${item.sourceName} ${item.relatedTickers.join(" ")}`.toLowerCase();
    return text.includes(normalizedQuery);
  });
}

function articleCategories(item: NewsItem) {
  return item.categories?.length ? item.categories : [String(item.primaryCategory ?? item.category ?? "Market")];
}

function newsGroups(items: NewsItem[], range: string) {
  const sorted = [...items].sort(sortNewestFirst);
  if (range === "Today") return [{ title: "Today", items: sorted }];

  const groups = [
    { title: "Today", items: sorted.filter((item) => bucketForItem(item) === "today") },
    { title: "Yesterday", items: sorted.filter((item) => bucketForItem(item) === "yesterday") },
    { title: range === "30D" ? "Earlier" : "Earlier this week", items: sorted.filter((item) => !["today", "yesterday"].includes(bucketForItem(item))) }
  ];

  return groups.filter((group) => group.items.length);
}

function bucketForItem(item: NewsItem) {
  return item.localDateBucket ?? bucketFromDate(item.publishedAt);
}

function bucketFromDate(value: string) {
  const date = new Date(value);
  const articleKey = localDayKey(date);
  const todayKey = localDayKey(new Date());
  const yesterdayKey = localDayKey(new Date(Date.now() - 86_400_000));
  if (articleKey === todayKey) return "today";
  if (articleKey === yesterdayKey) return "yesterday";
  return "last7d";
}

function localDayKey(date: Date) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function sortNewestFirst(a: NewsItem, b: NewsItem) {
  return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
}
