import { createHash } from "node:crypto";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import type { StockerInsightActionLabel, StockerViewInsight } from "@/lib/stocker-insight";
import { serverEnv } from "@/lib/server/env";

export type AiConfidence = "High" | "Medium" | "Low";

export type StockerAiInsight = {
  actionLabel: StockerInsightActionLabel;
  score: number;
  confidence: AiConfidence;
  simpleAnswer: string;
  whyMoving: string;
  whatLooksPositive: string[];
  whatLooksConcerning: string[];
  lookNowOrWait: string;
  whatWouldImprove: string[];
  whatWouldWorsen: string[];
  articlesUsed: Array<{
    title: string;
    source: string;
    url: string;
  }>;
};

export type EnhancedInsightResult = {
  insight: StockerAiInsight;
  aiAssisted: boolean;
  cacheStatus: "hit" | "miss" | "bypass";
  reason?: string;
};

type InsightCacheRecord = {
  fingerprint: string;
  expiresAt: number;
  generatedAt: string;
  model: string;
  insight: StockerAiInsight;
};

const AI_CACHE_TTL_MS = 8 * 60 * 60 * 1000;
const memoryCache = new Map<string, InsightCacheRecord>();

const actionLabelSchema = z.enum([
  "Strong research candidate",
  "Worth watching",
  "Mixed / needs confirmation",
  "Wait for a better setup",
  "Higher risk right now",
  "Limited data"
]);

const aiInsightSchema = z.object({
  actionLabel: actionLabelSchema,
  score: z.number().min(0).max(100),
  confidence: z.enum(["High", "Medium", "Low"]),
  simpleAnswer: z.string().min(1),
  whyMoving: z.string().min(1),
  whatLooksPositive: z.array(z.string()).max(6),
  whatLooksConcerning: z.array(z.string()).max(6),
  lookNowOrWait: z.string().min(1),
  whatWouldImprove: z.array(z.string()).max(6),
  whatWouldWorsen: z.array(z.string()).max(6),
  articlesUsed: z.array(z.object({ title: z.string(), source: z.string(), url: z.string().url() })).max(10)
});

export function ruleBasedToAiInsight(baseInsight: StockerViewInsight): StockerAiInsight {
  return {
    actionLabel: baseInsight.actionLabel,
    score: typeof baseInsight.score === "number" ? Math.max(0, Math.min(100, baseInsight.score)) : 0,
    confidence: baseInsight.score === null ? "Low" : baseInsight.score >= 75 ? "High" : baseInsight.score >= 55 ? "Medium" : "Low",
    simpleAnswer: baseInsight.simpleAnswer,
    whyMoving: baseInsight.whyMoving,
    whatLooksPositive: baseInsight.positives.slice(0, 3),
    whatLooksConcerning: baseInsight.concerns.slice(0, 3),
    lookNowOrWait: baseInsight.lookNowOrWait,
    whatWouldImprove: baseInsight.whatWouldImprove.slice(0, 3),
    whatWouldWorsen: baseInsight.whatWouldWorsen.slice(0, 3),
    articlesUsed: baseInsight.articlesUsed.slice(0, 10).map((article) => ({
      title: article.title,
      source: article.source,
      url: article.url
    }))
  };
}

export async function enhanceInsightWithAI(baseInsight: StockerViewInsight): Promise<EnhancedInsightResult> {
  const fallback = ruleBasedToAiInsight(baseInsight);
  const aiDisabled = process.env.AI_FEATURES_ENABLED === "false";
  if (!serverEnv.openaiApiKey || aiDisabled) {
    return {
      insight: fallback,
      aiAssisted: false,
      cacheStatus: "bypass",
      reason: !serverEnv.openaiApiKey ? "AI key unavailable" : "AI explicitly disabled"
    };
  }

  const modelName = process.env.AI_MODEL?.trim() || "gpt-4o-mini";
  const fingerprint = compactFingerprint(baseInsight);
  const cacheKey = baseInsight.symbol.toUpperCase();

  const cached = await readInsightCache(cacheKey);
  if (cached && cached.expiresAt > Date.now() && cached.fingerprint === fingerprint) {
    return {
      insight: cached.insight,
      aiAssisted: true,
      cacheStatus: "hit"
    };
  }

  const aiInsight = await generateAiInsight(baseInsight, modelName);
  if (!aiInsight) {
    return {
      insight: fallback,
      aiAssisted: false,
      cacheStatus: "bypass",
      reason: "AI generation failed"
    };
  }

  await writeInsightCache(cacheKey, {
    fingerprint,
    expiresAt: Date.now() + AI_CACHE_TTL_MS,
    generatedAt: new Date().toISOString(),
    model: modelName,
    insight: aiInsight
  });

  return {
    insight: aiInsight,
    aiAssisted: true,
    cacheStatus: "miss"
  };
}

async function generateAiInsight(baseInsight: StockerViewInsight, modelName: string): Promise<StockerAiInsight | null> {
  const openai = createOpenAI({ apiKey: serverEnv.openaiApiKey });

  const input = {
    symbol: baseInsight.symbol,
    companyName: baseInsight.companyName,
    score: baseInsight.score,
    actionLabel: baseInsight.actionLabel,
    quickReasons: baseInsight.quickReasons,
    simpleAnswer: baseInsight.simpleAnswer,
    whyMoving: baseInsight.whyMoving,
    newsSummary: baseInsight.newsSummary,
    newsTone: baseInsight.newsTone,
    positives: baseInsight.positives,
    concerns: baseInsight.concerns,
    lookNowOrWait: baseInsight.lookNowOrWait,
    chartTrendExplanation: baseInsight.chartTrendExplanation,
    fundamentalsExplanation: baseInsight.fundamentalsExplanation,
    peerComparisonExplanation: baseInsight.peerComparisonExplanation,
    whatWouldImprove: baseInsight.whatWouldImprove,
    whatWouldWorsen: baseInsight.whatWouldWorsen,
    articlesUsed: baseInsight.articlesUsed.slice(0, 10).map((article) => ({
      title: article.title,
      source: article.source,
      time: article.time,
      url: article.url,
      snippet: article.snippet
    }))
  };

  const prompt = [
    "Create a simple educational stock insight from structured data.",
    "Use only provided facts.",
    "Never invent numbers, news, price moves, or earnings.",
    "Never use direct buy/sell commands.",
    "Never say guaranteed, safe, or this will go up.",
    "If data is missing, state that clearly.",
    "Keep sentences short and plain.",
    "Explain technical terms in normal words.",
    "Use only article title/source/url from provided articlesUsed list.",
    "Return JSON only matching the schema."
  ].join(" ");

  try {
    const result = await generateObject({
      model: openai(modelName),
      schema: aiInsightSchema,
      temperature: 0.2,
      system: "You are a careful financial education assistant that only explains provided market data.",
      prompt: `${prompt}\n\nDATA:\n${JSON.stringify(input)}`
    });

    return result.object;
  } catch {
    return null;
  }
}

function compactFingerprint(baseInsight: StockerViewInsight) {
  const payload = {
    symbol: baseInsight.symbol,
    score: baseInsight.score,
    actionLabel: baseInsight.actionLabel,
    simpleAnswer: baseInsight.simpleAnswer,
    whyMoving: baseInsight.whyMoving,
    newsTone: baseInsight.newsTone,
    quickReasons: baseInsight.quickReasons,
    positives: baseInsight.positives,
    concerns: baseInsight.concerns,
    lookNowOrWait: baseInsight.lookNowOrWait,
    articlesUsed: baseInsight.articlesUsed.slice(0, 10).map((article) => ({
      title: article.title,
      source: article.source,
      time: article.time,
      url: article.url
    }))
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function readInsightCache(symbol: string): Promise<InsightCacheRecord | null> {
  if (isServerlessRuntime()) {
    return memoryCache.get(symbol) ?? null;
  }

  try {
    const fs = nodeFs();
    const raw = await fs.promises.readFile(insightCacheFile(symbol), "utf8");
    const parsed = JSON.parse(raw) as InsightCacheRecord;
    return parsed && parsed.insight ? parsed : null;
  } catch {
    return null;
  }
}

async function writeInsightCache(symbol: string, record: InsightCacheRecord) {
  memoryCache.set(symbol, record);
  if (isServerlessRuntime()) return;

  try {
    const fs = nodeFs();
    await fs.promises.mkdir(insightCacheDir(), { recursive: true });
    await fs.promises.writeFile(insightCacheFile(symbol), JSON.stringify(record, null, 2));
  } catch {
    // noop
  }
}

function nodeFs(): typeof import("fs") {
  return eval("require")("fs");
}

function nodePath(): typeof import("path") {
  return eval("require")("path");
}

function insightCacheDir() {
  return nodePath().join(process.cwd(), ".data", "provider-cache", "insights");
}

function insightCacheFile(symbol: string) {
  return nodePath().join(insightCacheDir(), `${symbol.toUpperCase()}.json`);
}

function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);
}
