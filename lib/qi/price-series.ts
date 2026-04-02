import { prisma } from "@/lib/prisma";

import { utcDateOnly } from "@/lib/qi/regime-engine";

/** Fechos diários antigos → recentes (eixo temporal crescente). */
export async function getDailyCloses(
  symbol: string,
  asOf: Date,
  maxDays: number,
): Promise<number[]> {
  const asset = await prisma.qiAsset.findUnique({
    where: { symbol },
    select: { id: true },
  });
  if (!asset) return [];
  const rows = await prisma.qiMarketPriceDaily.findMany({
    where: {
      assetId: asset.id,
      tradeDate: { lte: utcDateOnly(asOf) },
    },
    orderBy: { tradeDate: "desc" },
    take: maxDays,
    select: { close: true },
  });
  return rows.map((r) => Number(r.close)).reverse();
}

export function totalReturn(closes: number[], lookback: number): number | null {
  if (closes.length < lookback + 1) return null;
  const a = closes[closes.length - 1 - lookback]!;
  const b = closes[closes.length - 1]!;
  if (a <= 0) return null;
  return b / a - 1;
}
