import { Prisma } from "@prisma/client";

import {
  QI_MODEL_VERSION,
  RISK_FILTERS,
  SECTOR_CANDIDATES,
} from "@/lib/qi/constants";
import { getDailyCloses, totalReturn } from "@/lib/qi/price-series";
import { utcDateOnly } from "@/lib/qi/regime-engine";
import { prisma } from "@/lib/prisma";

const LOOKBACK = 126;

function sectorForCandidate(symbol: string): string | null {
  for (const [sec, syms] of Object.entries(SECTOR_CANDIDATES)) {
    if ((syms as readonly string[]).includes(symbol)) return sec;
  }
  return null;
}

export async function runAssetSelection(asOf: Date): Promise<{
  asOfDate: Date;
  snapshots: number;
}> {
  const asOfDate = utcDateOnly(asOf);
  let snapshots = 0;

  for (const [sectorCode, syms] of Object.entries(SECTOR_CANDIDATES)) {
    const sectorScores: { symbol: string; score: number; ret: number | null }[] =
      [];

    for (const sym of syms) {
      const closes = await getDailyCloses(sym, asOf, LOOKBACK + 10);
      const last = closes[closes.length - 1];
      if (last == null || last < RISK_FILTERS.minLastClose) continue;
      if (closes.length < RISK_FILTERS.minHistoryDays) continue;
      const ret = totalReturn(closes, Math.min(LOOKBACK, closes.length - 1));
      const score = ret ?? -1e9;
      sectorScores.push({ symbol: sym, score, ret });
    }

    sectorScores.sort((a, b) => b.score - a.score);
    let r = 1;
    for (const row of sectorScores) {
      const asset = await prisma.qiAsset.findUnique({
        where: { symbol: row.symbol },
        select: { id: true },
      });
      if (!asset) continue;

      await prisma.qiAssetScoreSnapshot.upsert({
        where: {
          assetId_asOfDate_modelVersion: {
            assetId: asset.id,
            asOfDate,
            modelVersion: QI_MODEL_VERSION,
          },
        },
        create: {
          assetId: asset.id,
          asOfDate,
          modelVersion: QI_MODEL_VERSION,
          compositeScore: new Prisma.Decimal(row.score),
          rank: r,
          components: {
            return126d: row.ret,
            sectorCode,
            sectorFromMap: sectorForCandidate(row.symbol),
          } as Prisma.InputJsonValue,
        },
        update: {
          compositeScore: new Prisma.Decimal(row.score),
          rank: r,
          components: {
            return126d: row.ret,
            sectorCode,
          } as Prisma.InputJsonValue,
        },
      });
      r += 1;
      snapshots += 1;
    }
  }

  return { asOfDate, snapshots };
}
