import { NextResponse } from "next/server";
import { successResponse } from "@/lib/api-response";
import { fetchRealHistory, providerCacheHeaders } from "@/lib/provider-gateway";

export async function GET(request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const url = new URL(request.url);
  const payload = await fetchRealHistory(decodeURIComponent(symbol).trim().toUpperCase(), {
    range: url.searchParams.get("range") ?? undefined,
    interval: url.searchParams.get("interval") ?? undefined
  });
  return NextResponse.json(
    {
      ...successResponse(payload.data, { source: payload.source, status: payload.status, delay: payload.delay, updatedAt: payload.updatedAt }),
      error: payload.error,
      meta: payload.meta
    },
    { headers: providerCacheHeaders }
  );
}
