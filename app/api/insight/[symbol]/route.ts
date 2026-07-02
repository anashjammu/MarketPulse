import { NextResponse } from "next/server";
import { successResponse } from "@/lib/api-response";
import { fetchStockerViewInsight } from "@/lib/stocker-insight";
import { providerCacheHeaders } from "@/lib/provider-gateway";

export async function GET(_: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const payload = await fetchStockerViewInsight(symbol);

  return NextResponse.json(
    {
      ...successResponse(payload.insight, {
        source: payload.source,
        status: payload.status,
        delay: payload.delay,
        updatedAt: payload.updatedAt
      }),
      meta: {
        unavailableFields: payload.unavailableFields
      }
    },
    { headers: providerCacheHeaders }
  );
}
