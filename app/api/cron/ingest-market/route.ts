import { ingestMarketData } from "@/lib/market/ingest";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Ingestão FRED + Yahoo. Protegida por CRON_SECRET (Bearer), padrão Vercel Cron.
 * Local: curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/ingest-market
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const fredKey = process.env.FRED_API_KEY;
  if (!fredKey) {
    return NextResponse.json(
      { error: "FRED_API_KEY não configurada" },
      { status: 500 },
    );
  }

  const summaries = await ingestMarketData(fredKey);
  const failed = summaries.filter((s) => s.error);
  const status = failed.length === summaries.length ? 500 : failed.length ? 207 : 200;

  return NextResponse.json(
    {
      ok: failed.length < summaries.length,
      summaries,
    },
    { status },
  );
}
