import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    FMP_API_KEY: Boolean(process.env.FMP_API_KEY),
    FINNHUB_API_KEY: Boolean(process.env.FINNHUB_API_KEY),
    ALPHA_VANTAGE_API_KEY: Boolean(process.env.ALPHA_VANTAGE_API_KEY),
    NEWS_API_KEY: Boolean(process.env.NEWS_API_KEY),
    GNEWS_API_KEY: Boolean(process.env.GNEWS_API_KEY),
    ENABLE_MOCK_DATA: process.env.ENABLE_MOCK_DATA === "true"
  });
}
