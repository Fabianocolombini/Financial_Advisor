import { NextResponse } from "next/server";
import { fetchYahooQuoteSummaryCached } from "@/lib/market/yahoo-quote";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await ctx.params;
  const sym = symbol?.trim().toUpperCase();
  if (!sym) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const quote = await fetchYahooQuoteSummaryCached(sym);
  return NextResponse.json(quote);
}
