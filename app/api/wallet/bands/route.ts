import { requireSession } from "@/lib/api-auth";
import { fetchYahooChart } from "@/lib/market/yahoo";
import { suggestWalletBands } from "@/lib/wallet/suggested-bands";
import { NextResponse } from "next/server";

const TWO_YEARS_SEC = 730 * 86400;

export async function GET(request: Request) {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.trim().toUpperCase();
  const classId = searchParams.get("classId")?.trim() ?? "";
  if (!symbol || !classId) {
    return NextResponse.json({ error: "symbol e classId são obrigatórios" }, { status: 400 });
  }

  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - TWO_YEARS_SEC;
  try {
    const { bars } = await fetchYahooChart(symbol, period1, period2, 300);
    const bands = suggestWalletBands(bars, classId, bars.at(-1)?.value ?? null);
    return NextResponse.json({ data: bands });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
