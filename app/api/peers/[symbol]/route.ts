import { NextResponse } from "next/server";
import { successResponse } from "@/lib/api-response";
import { fetchRealFundamentals, fetchRealQuote, providerCacheHeaders } from "@/lib/provider-gateway";
import { fetchPeers } from "@/lib/ticker-service";

export async function GET(_: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const normalized = decodeURIComponent(symbol).trim().toUpperCase();
  const peers = fetchPeers(normalized);

  const [quotes, fundamentals] = await Promise.all([
    Promise.all(peers.map((peer) => fetchRealQuote(peer.symbol))),
    Promise.all(peers.map((peer) => fetchRealFundamentals(peer.symbol)))
  ]);

  const rows = peers.map((peer, index) => {
    const quote = quotes[index].data;
    const fundamentalRows = fundamentals[index].data ?? [];
    const metricValue = (metric: string) => fundamentalRows.find((row) => row.metric === metric)?.value ?? "Unavailable";

    return {
      symbol: peer.symbol,
      name: quote?.name ?? peer.name,
      price: quote?.price ?? 0,
      change: quote?.changePercent ?? 0,
      volume: quote?.volume ?? null,
      marketCap: quote?.marketCap ?? null,
      pe: metricValue("P/E"),
      revenueGrowth: metricValue("Revenue Growth"),
      sector: metricValue("Sector") !== "Unavailable" ? metricValue("Sector") : peer.sector
    };
  });

  return NextResponse.json(successResponse(rows), { headers: providerCacheHeaders });
}
