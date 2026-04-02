import { prisma } from "@/lib/prisma";

/** Último valor FRED no `QiMacroSeriesPoint` para `externalId`. */
export async function latestMacroValue(
  externalId: string,
): Promise<number | null> {
  const row = await prisma.qiMacroSeriesPoint.findFirst({
    where: { series: { provider: "FRED", externalId } },
    orderBy: { observedOn: "desc" },
    select: { value: true },
  });
  return row ? Number(row.value) : null;
}

/**
 * Curva: preferência DGS10 − DGS2 (manifest tem DGS2/DGS10; GS* não estão no core).
 * Se faltar algum, usa T10Y2Y (spread já publicado pelo FRED).
 */
export async function computeYieldCurveSpread(): Promise<{
  spread: number | null;
  source: "DGS_DIFF" | "T10Y2Y";
}> {
  const d10 = await latestMacroValue("DGS10");
  const d2 = await latestMacroValue("DGS2");
  if (d10 != null && d2 != null) {
    return { spread: d10 - d2, source: "DGS_DIFF" };
  }
  const t = await latestMacroValue("T10Y2Y");
  return { spread: t, source: "T10Y2Y" };
}

/**
 * CPI YoY aproximado (mensal): último índice vs ~12 observações atrás em CPIAUCSL.
 */
export async function computeCpiYoyPercent(): Promise<number | null> {
  const series = await prisma.qiMacroSeries.findUnique({
    where: {
      provider_externalId: { provider: "FRED", externalId: "CPIAUCSL" },
    },
    select: { id: true },
  });
  if (!series) return null;
  const pts = await prisma.qiMacroSeriesPoint.findMany({
    where: { seriesId: series.id },
    orderBy: { observedOn: "desc" },
    take: 14,
    select: { value: true },
  });
  if (pts.length < 13) return null;
  const latest = Number(pts[0].value);
  const yago = Number(pts[12].value);
  if (!Number.isFinite(latest) || !Number.isFinite(yago) || yago === 0) {
    return null;
  }
  return ((latest / yago - 1) * 100);
}

/** Fed em alta: último FEDFUNDS vs observação ~3 meses antes (série mensal). */
export async function computeFedFundsRising(): Promise<boolean | null> {
  const series = await prisma.qiMacroSeries.findUnique({
    where: {
      provider_externalId: { provider: "FRED", externalId: "FEDFUNDS" },
    },
    select: { id: true },
  });
  if (!series) return null;
  const pts = await prisma.qiMacroSeriesPoint.findMany({
    where: { seriesId: series.id },
    orderBy: { observedOn: "desc" },
    take: 5,
    select: { value: true },
  });
  if (pts.length < 4) return null;
  const now = Number(pts[0].value);
  const older = Number(pts[3].value);
  if (!Number.isFinite(now) || !Number.isFinite(older)) return null;
  return now > older;
}

export type MacroDerivedSnapshot = {
  yieldCurve: number | null;
  yieldCurveSource: "DGS_DIFF" | "T10Y2Y" | null;
  cpiYoyPercent: number | null;
  fedFundsRising: boolean | null;
  vix: number | null;
  nfci: number | null;
  unrate: number | null;
  hyCreditSpread: number | null;
};

export async function buildMacroDerivedSnapshot(): Promise<MacroDerivedSnapshot> {
  const [{ spread, source }, cpiYoyPercent, fedFundsRising] = await Promise.all([
    computeYieldCurveSpread(),
    computeCpiYoyPercent(),
    computeFedFundsRising(),
  ]);

  const [vix, nfci, unrate, hy] = await Promise.all([
    latestMacroValue("VIXCLS"),
    latestMacroValue("NFCI"),
    latestMacroValue("UNRATE"),
    latestMacroValue("BAMLH0A0HYM2"),
  ]);

  return {
    yieldCurve: spread,
    yieldCurveSource: spread == null ? null : source,
    cpiYoyPercent,
    fedFundsRising,
    vix,
    nfci,
    unrate,
    hyCreditSpread: hy,
  };
}
