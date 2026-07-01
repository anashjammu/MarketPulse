export type ConfidenceLevel = "Low" | "Medium" | "High";
export type SourceConfidence = "High" | "Medium" | "Low";

export type NewsSourceItem = {
  id: string;
  title: string;
  sourceName: string;
  author?: string;
  url: string;
  publishedAt: string;
  publishedAtLocal?: string;
  relatedTickers: string[];
  category: string;
  snippet: string;
  fullText?: string;
  sentiment?: string;
  impactLevel?: string;
  sourceConfidence: SourceConfidence;
};

export type AIAnalysis = {
  mode: "Detailed Analysis";
  confidenceLevel: ConfidenceLevel;
  dataCompleteness: number;
  generatedAt: string;
  plainEnglishSummary: string;
  whatHappened: string;
  whyItMatters: string;
  bullCase: string;
  bearCase: string;
  keyCatalysts: string[];
  keyRisks: string[];
  valuationContext: string;
  technicalContext: string;
  newsContext: string;
  macroContext: string;
  missingData: string[];
  sources: NewsSourceItem[];
};

export const researchDisclaimer =
  "AI analysis is generated from the sources and market data listed below. It is for research and education only, not financial advice. Data may be delayed, incomplete, or inaccurate.";

export const footerResearchDisclaimer =
  "StockerView is for research and educational purposes only. Not financial advice. Data may be delayed, incomplete, or inaccurate.";

export const newsSources: NewsSourceItem[] = [];

export function normalizeNewsSources(sources: NewsSourceItem[]) {
  return sources.map((source) => ({
    ...source,
    publishedAtLocal: source.publishedAtLocal ?? source.publishedAt
  }));
}

export function fetchTickerNews(_symbol: string) {
  return [] as NewsSourceItem[];
}

export function fetchMarketNews() {
  return [] as NewsSourceItem[];
}

export function fetchMacroNews() {
  return [] as NewsSourceItem[];
}

export function fetchNewsByCategory(_category: string) {
  return [] as NewsSourceItem[];
}

export function normalizeNewsArticle(rawArticle: Partial<NewsSourceItem>): NewsSourceItem {
  return {
    id: rawArticle.id ?? "unavailable",
    title: rawArticle.title ?? "Data unavailable",
    sourceName: rawArticle.sourceName ?? "Unavailable",
    author: rawArticle.author,
    url: rawArticle.url ?? "#",
    publishedAt: rawArticle.publishedAt ?? new Date().toISOString(),
    publishedAtLocal: rawArticle.publishedAtLocal,
    relatedTickers: rawArticle.relatedTickers ?? [],
    category: rawArticle.category ?? "Uncategorized",
    snippet: rawArticle.snippet ?? "Data unavailable",
    fullText: rawArticle.fullText,
    sentiment: rawArticle.sentiment,
    impactLevel: rawArticle.impactLevel,
    sourceConfidence: rawArticle.sourceConfidence ?? "Low"
  };
}

export function normalizeNewsArticles(rawArticles: Array<Partial<NewsSourceItem>>) {
  return rawArticles.map(normalizeNewsArticle);
}

export function calculateDataCompleteness(fields: Array<unknown>) {
  if (!fields.length) return 0;
  const available = fields.filter((field) => field !== null && field !== undefined && field !== "" && field !== "Data unavailable").length;
  return Math.round((available / fields.length) * 100);
}

export function generateSourceGroundedAnalysis({
  id: _id,
  title: _title,
  topic,
  sources = [],
  missingData = [],
  confidence,
  confidenceLevel = "Low",
  dataCompleteness = 0
}: {
  id?: string;
  title?: string;
  topic: string;
  sources?: NewsSourceItem[];
  missingData?: string[];
  confidence?: ConfidenceLevel;
  confidenceLevel?: ConfidenceLevel;
  dataCompleteness?: number;
}): AIAnalysis {
  const normalizedSources = normalizeNewsSources(sources);
  const missing = missingData.length ? missingData : ["Provider market data", "Provider news sources"];

  return {
    mode: "Detailed Analysis",
    confidenceLevel: confidence ?? confidenceLevel,
    dataCompleteness,
    generatedAt: new Date().toISOString(),
    plainEnglishSummary: `${topic} analysis is unavailable because provider data has not been connected.`,
    whatHappened: "Data unavailable.",
    whyItMatters: "Provider data is required before StockerView can generate a source-grounded explanation.",
    bullCase: "Data unavailable.",
    bearCase: "Data unavailable.",
    keyCatalysts: ["Data unavailable"],
    keyRisks: ["Data unavailable"],
    valuationContext: "Data unavailable.",
    technicalContext: "Data unavailable.",
    newsContext: normalizedSources.length ? "Analysis can reference connected sources." : "Sources unavailable.",
    macroContext: "Data unavailable.",
    missingData: missing,
    sources: normalizedSources
  };
}
