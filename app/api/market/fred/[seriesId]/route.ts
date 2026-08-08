import { NextResponse } from "next/server";
import { fetchFredObservations } from "@/lib/market/fred";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ seriesId: string }> },
) {
  const { seriesId } = await ctx.params;
  const id = seriesId?.trim().toUpperCase();
  if (!id) {
    return NextResponse.json({ error: "seriesId required" }, { status: 400 });
  }

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FRED_API_KEY not configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const years = Number(url.searchParams.get("years") ?? "5");
  const start = new Date();
  start.setFullYear(start.getFullYear() - Math.min(Math.max(years, 1), 10));
  const observationStart = start.toISOString().slice(0, 10);

  try {
    const observations = await fetchFredObservations(apiKey, id, observationStart);
    return NextResponse.json({
      seriesId: id,
      observations: observations.map((o) => ({ date: o.date, value: o.value })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
