import { NextResponse } from "next/server";
import { successResponse } from "@/lib/api-response";
import { enhanceInsightWithAI } from "@/lib/stocker-insight-ai";
import { fetchStockerViewInsight } from "@/lib/stocker-insight";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const normalized = decodeURIComponent(symbol).trim().toUpperCase();
  const basePayload = await fetchStockerViewInsight(normalized);
  const enhanced = await enhanceInsightWithAI(basePayload.insight);

  return NextResponse.json({
    ...successResponse(enhanced.insight, {
      source: enhanced.aiAssisted ? "ai-assisted" : "rule-based",
      status: enhanced.aiAssisted ? (enhanced.cacheStatus === "hit" ? "cached" : "live") : basePayload.status,
      delay: basePayload.delay,
      updatedAt: basePayload.updatedAt
    }),
    meta: {
      aiUsed: enhanced.aiAssisted,
      cacheStatus: enhanced.cacheStatus,
      fallbackReason: enhanced.reason,
      unavailableFields: basePayload.unavailableFields
    }
  });
}
