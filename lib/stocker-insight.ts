import { calculateOpportunityScore, type OpportunityScoreResult } from "@/lib/opportunity-scoring";
import {
  fetchRealEarnings,
  fetchRealFundamentals,
  fetchRealHistory,
  fetchRealProfile,
  fetchRealQuote,
  fetchRealTechnicals,
  fetchRealTickerNews,
  type NormalizedEarnings,
  type NormalizedFundamental,
  type NormalizedNewsArticle,
  type NormalizedTechnical
} from "@/lib/provider-gateway";
import { fetchRatingsSignal, type NormalizedRatings } from "@/lib/server/providers/ratings";
import { fetchPeers, fetchTickerOverview, type TickerOverview } from "@/lib/ticker-service";
import { footerResearchDisclaimer } from "@/lib/research-engine";

export type StockerInsightActionLabel =
  | "Strong research candidate"
  | "Worth watching"
  | "Mixed / needs confirmation"
  | "Wait for a better setup"
  | "Higher risk right now"
  | "Limited data";

export type StockerInsightActionStyle = "Research" | "Watch" | "Wait" | "Avoid for now";
export type NewsTone = "mostly positive" | "mixed" | "mostly negative" | "unclear";
export type ArticleTone = "positive" | "negative" | "neutral";

export type InsightArticleUsed = {
  title: string;
  source: string;
  time: string;
  url: string;
  snippet: string;
  tone: ArticleTone;
};

export type StockerViewInsight = {
  symbol: string;
  companyName: string;
  actionLabel: StockerInsightActionLabel;
  actionStyle: StockerInsightActionStyle;
  score: number | null;
  simpleAnswer: string;
  whyMoving: string;
  quickReasons: string[];
  newsTone: NewsTone;
  newsSummary: string;
  positives: string[];
  concerns: string[];
  lookNowOrWait: string;
  beforeYouDecide: string[];
  chartTrendExplanation: string;
  fundamentalsExplanation: string;
  peerComparisonExplanation: string;
  whatWouldImprove: string[];
  whatWouldWorsen: string[];
  labelWhy: string[];
  labelRisks: string[];
  whatChangesLabel: string[];
  articlesUsed: InsightArticleUsed[];
  generatedAt: string;
  disclaimer: string;
};

export type StockerInsightInput = {
  symbol: string;
  companyName: string;
  overview: TickerOverview;
  technicals: NormalizedTechnical[];
  fundamentals: NormalizedFundamental[];
  earnings: NormalizedEarnings[];
  news: NormalizedNewsArticle[];
  ratings: NormalizedRatings;
  peerChanges: Array<{ symbol: string; change: number }>;
  opportunity: OpportunityScoreResult;
};

export type StockerInsightPayload = {
  insight: StockerViewInsight;
  source: string;
  status: "live" | "partial" | "unavailable";
  delay: string;
  updatedAt: string;
  unavailableFields: string[];
};

const POSITIVE_NEWS_KEYWORDS = [
  "beat",
  "beats",
  "raises guidance",
  "raised guidance",
  "upgrade",
  "upgraded",
  "price target raised",
  "strong demand",
  "partnership",
  "investment",
  "expansion",
  "record revenue",
  "margin improvement"
];

const NEGATIVE_NEWS_KEYWORDS = [
  "miss",
  "misses",
  "lowers guidance",
  "lowered guidance",
  "downgrade",
  "downgraded",
  "investigation",
  "lawsuit",
  "weak demand",
  "layoff",
  "margin pressure",
  "recall",
  "cuts forecast"
];

const SYMBOL_ALIASES: Record<string, string[]> = {
  NVDA: ["Nvidia", "AI chips", "GPUs", "data centers", "Blackwell", "Jensen Huang"],
  AMD: ["Advanced Micro Devices", "CPUs", "GPUs", "AI chips", "Ryzen", "EPYC", "Instinct"],
  AAPL: ["Apple", "iPhone", "services", "Mac", "Tim Cook"],
  MSFT: ["Microsoft", "Azure", "cloud", "Copilot", "AI", "enterprise software"],
  GOOGL: ["Google", "Search", "YouTube", "cloud", "ads", "AI"],
  MU: ["Micron", "memory chips", "DRAM", "HBM", "semiconductor cycle"]
};

export async function fetchStockerViewInsight(symbol: string): Promise<StockerInsightPayload> {
  const normalized = decodeURIComponent(symbol).trim().toUpperCase();
  const overview = fetchTickerOverview(normalized);
  const [quotePayload, profilePayload, newsPayload, technicalPayload, fundamentalsPayload, earningsPayload] = await Promise.all([
    fetchRealQuote(normalized),
    fetchRealProfile(normalized),
    fetchRealTickerNews(normalized),
    fetchRealTechnicals(normalized),
    fetchRealFundamentals(normalized),
    fetchRealEarnings(normalized)
  ]);
  const historyPayload = await fetchRealHistory(normalized, { range: "1Y", interval: "1d" });
  const ratingsPayload = await fetchRatingsSignal(normalized, newsPayload.data ?? []);

  const peers = fetchPeers(normalized);
  const peerQuotes = await Promise.all(peers.map((peer) => fetchRealQuote(peer.symbol)));
  const peerChanges = peerQuotes.map((payload, index) => ({
    symbol: peers[index].symbol,
    change: payload.data?.changePercent ?? 0
  }));

  const opportunity = calculateOpportunityScore({
    symbol: normalized,
    price: quotePayload.data?.price ?? 0,
    dayHigh: quotePayload.data?.dayHigh,
    dayLow: quotePayload.data?.dayLow,
    technicals: technicalPayload.data ?? [],
    fundamentals: fundamentalsPayload.data ?? [],
    news: newsPayload.data ?? [],
    candles: historyPayload.data?.candles ?? [],
    ratings: ratingsPayload.data,
    ratingsMeta: ratingsPayload.meta
  });

  const insight = buildStockerViewInsight({
    symbol: normalized,
    companyName: profilePayload.data?.companyName ?? quotePayload.data?.name ?? overview.name,
    overview,
    technicals: technicalPayload.data ?? [],
    fundamentals: fundamentalsPayload.data ?? [],
    earnings: earningsPayload.data ?? [],
    news: newsPayload.data ?? [],
    ratings: ratingsPayload.data,
    peerChanges,
    opportunity
  });

  const unavailableFields = [
    ...(!quotePayload.data ? ["quote"] : []),
    ...(!(technicalPayload.data ?? []).length ? ["technicals"] : []),
    ...(!(fundamentalsPayload.data ?? []).length ? ["fundamentals"] : []),
    ...(!(earningsPayload.data ?? []).length ? ["earnings"] : []),
    ...(!(newsPayload.data ?? []).length ? ["news"] : []),
    ...(!peerChanges.length ? ["peer comparison"] : [])
  ];

  const hasCoreData = Boolean(quotePayload.data || (technicalPayload.data ?? []).length || (fundamentalsPayload.data ?? []).length || (newsPayload.data ?? []).length);

  return {
    insight,
    source: [quotePayload.source, newsPayload.source, technicalPayload.source, fundamentalsPayload.source, earningsPayload.source]
      .filter(Boolean)
      .join(" + ") || "Unavailable",
    status: hasCoreData ? (unavailableFields.length ? "partial" : "live") : "unavailable",
    delay: "Provider-dependent",
    updatedAt: new Date().toISOString(),
    unavailableFields
  };
}

export function buildStockerViewInsight(input: StockerInsightInput): StockerViewInsight {
  const score = input.opportunity.score;
  const actionLabel = actionLabelFromScore(score);
  const actionStyle = actionStyleFromLabel(actionLabel);
  const articlesUsed = normalizeArticles(input.news).slice(0, 8);
  const newsTone = aggregateNewsTone(articlesUsed);
  const trendText = chartTrendExplanation(input.technicals);
  const momentumText = momentumExplanation(input.technicals);
  const volumeText = volumeExplanation(input.technicals);
  const peerText = peerExplanation(input.peerChanges);
  const fundamentalsText = fundamentalsExplanation(input.fundamentals);
  const earningsText = earningsExplanation(input.earnings);
  const ratingText = ratingsExplanation(input.ratings);
  const newsSummary = buildNewsSummary(input.symbol, input.companyName, articlesUsed, newsTone);
  const moveDirection = input.overview.changePercent >= 0 ? "up" : "down";
  const priceMove = formatSignedPercent(input.overview.changePercent);

  const whyMoving = buildWhyMovingSummary({
    moveDirection,
    priceMove,
    newsSummary,
    newsTone,
    trendText,
    momentumText,
    volumeText,
    earningsText,
    ratingText,
    peerText,
    hasNews: articlesUsed.length > 0
  });

  const positives = buildPositives(input, newsTone, trendText, fundamentalsText, ratingText, peerText);
  const concerns = buildConcerns(input, newsTone, trendText, fundamentalsText, ratingText, peerText, momentumText);
  const whatWouldImprove = [
    "Price holds above short-term and medium-term trend levels.",
    "Trading activity supports up moves instead of fading.",
    "Earnings and revenue updates continue to improve.",
    "Company-specific news stays constructive."
  ];
  const whatWouldWorsen = [
    "Price remains below key trend levels.",
    "Trading activity rises mostly on down days.",
    "Earnings, margins, or guidance weaken.",
    "Negative company-specific or sector headlines increase."
  ];

  const simpleAnswer = buildSimpleAnswer({
    symbol: input.symbol,
    companyName: input.companyName,
    actionLabel,
    trendText,
    fundamentalsText,
    newsTone,
    moveDirection
  });

  const quickReasons = [
    `${input.symbol} is ${moveDirection} ${priceMove} today.`,
    compactReason(trendText),
    compactReason(newsSummary)
  ].slice(0, 3);

  const lookNowOrWait = lookNowOrWaitText(actionLabel);

  const labelWhy = quickReasons.concat([compactReason(fundamentalsText)]).slice(0, 4);
  const labelRisks = concerns.slice(0, 3);

  return {
    symbol: input.symbol,
    companyName: input.companyName,
    actionLabel,
    actionStyle,
    score,
    simpleAnswer,
    whyMoving,
    quickReasons,
    newsTone,
    newsSummary,
    positives,
    concerns,
    lookNowOrWait,
    beforeYouDecide: [
      "What does the company do?",
      "Is revenue growing?",
      "Is the company profitable?",
      "Is the stock trending up or down?",
      "Is recent news positive or negative?",
      "Is it expensive compared with growth?",
      "How does it compare with peers?",
      "Are you comfortable with the risk?"
    ],
    chartTrendExplanation: `${trendText} ${momentumText} ${volumeText}`,
    fundamentalsExplanation: `${fundamentalsText} ${earningsText}`,
    peerComparisonExplanation: peerText,
    whatWouldImprove,
    whatWouldWorsen,
    labelWhy,
    labelRisks,
    whatChangesLabel: whatWouldImprove.slice(0, 3),
    articlesUsed,
    generatedAt: new Date().toISOString(),
    disclaimer: footerResearchDisclaimer
  };
}

function buildSimpleAnswer(input: {
  symbol: string;
  companyName: string;
  actionLabel: StockerInsightActionLabel;
  trendText: string;
  fundamentalsText: string;
  newsTone: NewsTone;
  moveDirection: "up" | "down";
}) {
  if (input.actionLabel === "Limited data") {
    return "There is not enough data to make a clear read.";
  }
  if (input.actionLabel === "Strong research candidate") {
    return `${input.symbol} looks constructive right now. Trend and business signals are supportive, and this may be worth researching.`;
  }
  if (input.actionLabel === "Worth watching") {
    return `${input.symbol} may be worth watching. Some signals are constructive, but the setup is not fully confirmed.`;
  }
  if (input.actionLabel === "Mixed / needs confirmation") {
    return `${input.symbol} looks mixed right now. ${compactReason(input.fundamentalsText)} but ${compactReason(input.trendText).toLowerCase()}.`;
  }
  if (input.actionLabel === "Wait for a better setup") {
    return `${input.symbol} may need a better setup first. Current trend and risk signals are not strong enough yet.`;
  }
  return `${input.symbol} looks higher risk right now because trend and/or sentiment are weak.`;
}

function buildWhyMovingSummary(input: {
  moveDirection: "up" | "down";
  priceMove: string;
  newsSummary: string;
  newsTone: NewsTone;
  trendText: string;
  momentumText: string;
  volumeText: string;
  earningsText: string;
  ratingText: string;
  peerText: string;
  hasNews: boolean;
}) {
  if (!input.hasNews) {
    return `The stock is ${input.moveDirection} ${input.priceMove} today. There is no clear company-specific news explaining the move. This may be related to broader market or sector movement. ${input.trendText} ${input.peerText}`;
  }

  if (input.moveDirection === "down" && input.newsTone === "mostly positive") {
    return `The stock is down ${input.priceMove} today even though recent company headlines are mostly positive. This can happen when valuation is stretched, investors take profits, or the broader sector is weak. ${input.trendText} ${input.peerText}`;
  }

  if (input.moveDirection === "up" && input.newsTone === "mostly positive") {
    return `The stock is up ${input.priceMove} today and recent company headlines are mostly positive. This may reflect demand optimism, supportive analyst views, or stronger company updates. ${input.volumeText} ${input.momentumText}`;
  }

  return `The stock is ${input.moveDirection} ${input.priceMove} today. ${input.newsSummary} ${input.trendText} ${input.earningsText} ${input.ratingText}`;
}

function buildPositives(
  input: StockerInsightInput,
  newsTone: NewsTone,
  trendText: string,
  fundamentalsText: string,
  ratingText: string,
  peerText: string
) {
  const rows = input.fundamentals;
  const revenueGrowth = metricValue(rows, "Revenue Growth");
  const grossMargin = metricValue(rows, "Gross Margin");
  const positives = [
    revenueGrowth !== "Unavailable" ? `Sales growth is ${revenueGrowth}, which can signal healthy demand.` : null,
    grossMargin !== "Unavailable" ? `Gross margin is ${grossMargin}, which can show pricing power.` : null,
    newsTone === "mostly positive" ? "Recent company headlines are mostly positive." : null,
    input.ratings.status === "available" && input.ratings.consensus?.consensusLabel ? `Analyst consensus is ${input.ratings.consensus.consensusLabel}.` : null,
    !trendText.toLowerCase().includes("below") ? compactReason(trendText) : null,
    compactReason(peerText)
  ].filter(Boolean) as string[];

  return positives.length ? positives.slice(0, 6) : [compactReason(fundamentalsText)];
}

function buildConcerns(
  input: StockerInsightInput,
  newsTone: NewsTone,
  trendText: string,
  fundamentalsText: string,
  ratingText: string,
  peerText: string,
  momentumText: string
) {
  const rows = input.fundamentals;
  const debtEquity = metricValue(rows, "Debt/Equity");
  const pe = metricValue(rows, "P/E");

  const concerns = [
    trendText.toLowerCase().includes("below") ? compactReason(trendText) : null,
    debtEquity !== "Unavailable" ? `Debt/Equity is ${debtEquity}. Higher debt can increase downside risk.` : "Debt data is missing, so balance-sheet risk is harder to judge.",
    pe !== "Unavailable" && parseMetricNumber(pe) !== null && (parseMetricNumber(pe) ?? 0) > 35 ? `P/E is ${pe}. If growth slows, valuation risk can increase.` : null,
    newsTone === "mostly negative" ? "Recent company headlines are mostly negative." : null,
    input.ratings.status === "available" && (input.ratings.recentActions ?? []).some((item) => `${item.action ?? ""} ${item.rating ?? ""}`.toLowerCase().includes("downgrade"))
      ? "Recent analyst downgrades can pressure sentiment."
      : null,
    compactReason(momentumText),
    compactReason(ratingText),
    compactReason(peerText)
  ].filter(Boolean) as string[];

  return concerns.length ? concerns.slice(0, 6) : [compactReason(fundamentalsText)];
}

function lookNowOrWaitText(label: StockerInsightActionLabel) {
  if (label === "Strong research candidate") {
    return "Data looks constructive. This may be worth researching, while still checking risk and position sizing.";
  }
  if (label === "Worth watching") {
    return "Some positives are present, but confirmation is still important. Watching may make sense.";
  }
  if (label === "Mixed / needs confirmation") {
    return "The setup looks mixed. Waiting for clearer confirmation may make sense.";
  }
  if (label === "Wait for a better setup") {
    return "Momentum or fundamentals are not strong enough yet. Waiting may make sense.";
  }
  if (label === "Higher risk right now") {
    return "Risk looks elevated right now. Avoiding or waiting for a clearer setup may make sense.";
  }
  return "The data does not give a clear answer yet. Waiting for more reliable information may make sense.";
}

function chartTrendExplanation(technicals: NormalizedTechnical[]) {
  const ma20Signal = technicalSignal(technicals, "20D MA");
  const ma50Signal = technicalSignal(technicals, "50D MA");
  if (!ma20Signal && !ma50Signal) return "Chart trend data is limited right now.";

  if ([ma20Signal, ma50Signal].some((value) => (value ?? "").toLowerCase().includes("below"))) {
    return "Price is below short-term or medium-term trend levels, which can mean trend momentum is weaker.";
  }

  return "Price is holding above short-term and medium-term trend levels, which is usually a constructive sign.";
}

function momentumExplanation(technicals: NormalizedTechnical[]) {
  const rsi = technicalValue(technicals, "RSI");
  const numeric = parseMetricNumber(rsi);
  if (numeric === null) return "Momentum gauge data is limited.";
  if (numeric > 70) return `Momentum gauge is ${numeric.toFixed(1)}, which is elevated and can be stretched.`;
  if (numeric < 30) return `Momentum gauge is ${numeric.toFixed(1)}, which is weak and can reflect heavy selling.`;
  return `Momentum gauge is ${numeric.toFixed(1)}, which is around neutral.`;
}

function volumeExplanation(technicals: NormalizedTechnical[]) {
  const relativeVolume = technicalValue(technicals, "Volume");
  const numeric = parseMetricNumber(relativeVolume);
  if (numeric === null) return "Trading activity compared with normal is unavailable.";
  if (numeric >= 1.2) return "Trading activity compared with normal is heavier than usual.";
  if (numeric < 0.9) return "Trading activity compared with normal is lighter than usual.";
  return "Trading activity compared with normal is close to usual levels.";
}

function fundamentalsExplanation(fundamentals: NormalizedFundamental[]) {
  const revenueGrowth = metricValue(fundamentals, "Revenue Growth");
  const grossMargin = metricValue(fundamentals, "Gross Margin");
  const pe = metricValue(fundamentals, "P/E");

  const lines = [
    revenueGrowth !== "Unavailable" ? `Revenue growth is ${revenueGrowth}.` : "Revenue growth data is unavailable.",
    grossMargin !== "Unavailable" ? `Gross margin is ${grossMargin}.` : "Margin data is unavailable.",
    pe !== "Unavailable" ? `P/E is ${pe}.` : "Valuation ratio data is limited."
  ];

  return lines.join(" ");
}

function earningsExplanation(earnings: NormalizedEarnings[]) {
  if (!earnings.length) return "Earnings data is unavailable.";
  const latest = earnings[0];
  return `Latest earnings update: ${latest.quarter}, revenue ${latest.revenue}, EPS ${latest.eps}, surprise ${latest.surprise}.`;
}

function ratingsExplanation(ratings: NormalizedRatings) {
  if (!ratings || ratings.status === "unavailable" || ratings.status === "error") {
    return "Analyst ratings data is limited.";
  }

  const consensus = ratings.consensus?.consensusLabel ? `Analyst consensus is ${ratings.consensus.consensusLabel}.` : "Analyst coverage is available.";
  const action = ratings.recentActions?.[0]
    ? `Recent analyst update: ${[ratings.recentActions[0].firm, ratings.recentActions[0].action, ratings.recentActions[0].rating].filter(Boolean).join(" ")}.`
    : null;
  return [consensus, action].filter(Boolean).join(" ");
}

function peerExplanation(peers: Array<{ symbol: string; change: number }>) {
  if (!peers.length) return "Peer comparison data is limited.";
  const upCount = peers.filter((peer) => peer.change > 0).length;
  return `Peer group check: ${upCount} of ${peers.length} peers are up today.`;
}

function normalizeArticles(news: NormalizedNewsArticle[]): InsightArticleUsed[] {
  return news
    .map((article) => ({
      title: article.headline,
      source: article.sourceName,
      time: article.publishedAt,
      url: article.url,
      snippet: article.snippet,
      tone: classifyArticleTone(`${article.headline} ${article.snippet}`)
    }))
    .filter((article) => article.url && article.url !== "#");
}

export function classifyArticleTone(text: string): ArticleTone {
  const normalized = text.toLowerCase();
  const positiveHits = POSITIVE_NEWS_KEYWORDS.filter((keyword) => normalized.includes(keyword)).length;
  const negativeHits = NEGATIVE_NEWS_KEYWORDS.filter((keyword) => normalized.includes(keyword)).length;

  if (positiveHits > negativeHits && positiveHits > 0) return "positive";
  if (negativeHits > positiveHits && negativeHits > 0) return "negative";
  return "neutral";
}

function aggregateNewsTone(articles: InsightArticleUsed[]): NewsTone {
  if (!articles.length) return "unclear";
  const positive = articles.filter((article) => article.tone === "positive").length;
  const negative = articles.filter((article) => article.tone === "negative").length;
  const neutral = articles.filter((article) => article.tone === "neutral").length;

  if (positive > negative && positive >= Math.max(2, neutral)) return "mostly positive";
  if (negative > positive && negative >= Math.max(2, neutral)) return "mostly negative";
  return "mixed";
}

function buildNewsSummary(symbol: string, companyName: string, articles: InsightArticleUsed[], tone: NewsTone) {
  if (!articles.length) {
    return "No clear company-specific news explains today's move. The stock may be moving because of broader market or sector pressure.";
  }

  const aliasSignals = SYMBOL_ALIASES[symbol] ?? [];
  const text = articles
    .slice(0, 8)
    .map((article) => `${article.title} ${article.snippet}`.toLowerCase())
    .join(" ");
  const matchedAliases = aliasSignals.filter((alias) => text.includes(alias.toLowerCase())).slice(0, 3);
  const theme = matchedAliases.length
    ? `${companyDisplayName(symbol, companyName)} themes include ${matchedAliases.join(", ")}.`
    : `Recent company headlines are focused on ${companyDisplayName(symbol, companyName)} operations and outlook.`;

  return `${theme} News tone looks ${tone}.`;
}

function companyDisplayName(symbol: string, companyName: string) {
  return SYMBOL_ALIASES[symbol]?.[0] ?? companyName ?? symbol;
}

function actionLabelFromScore(score: number | null): StockerInsightActionLabel {
  if (score === null) return "Limited data";
  if (score >= 85) return "Strong research candidate";
  if (score >= 70) return "Worth watching";
  if (score >= 55) return "Mixed / needs confirmation";
  if (score >= 40) return "Wait for a better setup";
  return "Higher risk right now";
}

function actionStyleFromLabel(label: StockerInsightActionLabel): StockerInsightActionStyle {
  if (label === "Strong research candidate") return "Research";
  if (label === "Worth watching" || label === "Mixed / needs confirmation") return "Watch";
  if (label === "Wait for a better setup" || label === "Limited data") return "Wait";
  return "Avoid for now";
}

function metricValue(rows: NormalizedFundamental[], metric: string) {
  return rows.find((row) => row.metric === metric)?.value ?? "Unavailable";
}

function technicalValue(rows: NormalizedTechnical[], labelIncludes: string) {
  return rows.find((row) => row.label.toLowerCase().includes(labelIncludes.toLowerCase()))?.value ?? "Unavailable";
}

function technicalSignal(rows: NormalizedTechnical[], labelIncludes: string) {
  return rows.find((row) => row.label.toLowerCase().includes(labelIncludes.toLowerCase()))?.signal;
}

function parseMetricNumber(value: string | null | undefined) {
  if (!value || value === "Unavailable") return null;
  const match = value.replace(/[$,%]/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSignedPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function compactReason(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace("right now", "")
    .trim();
}
