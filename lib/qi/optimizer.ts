import { Prisma } from "@prisma/client";

import {
  QI_MODEL_VERSION,
  RISK_PROFILE,
  SECTOR_CANDIDATES,
} from "@/lib/qi/constants";
import { utcDateOnly } from "@/lib/qi/regime-engine";
import { prisma } from "@/lib/prisma";

export async function runQiRecommendation(asOf: Date): Promise<{
  asOfDate: Date;
  recommendationId: string;
}> {
  const asOfDate = utcDateOnly(asOf);

  const sectors = await prisma.qiSectorScoreSnapshot.findMany({
    where: { asOfDate, modelVersion: QI_MODEL_VERSION },
    orderBy: { rank: "asc" },
    take: RISK_PROFILE.topSectors,
    select: { sectorCode: true, compositeScore: true, rank: true },
  });

  const macro = await prisma.qiRegimeSnapshot.findFirst({
    where: {
      kind: "MACRO",
      asOfDate,
      modelVersion: QI_MODEL_VERSION,
    },
    select: { regimeLabel: true },
  });

  const risk = await prisma.qiRegimeSnapshot.findFirst({
    where: {
      kind: "RISK",
      asOfDate,
      modelVersion: QI_MODEL_VERSION,
    },
    select: { regimeLabel: true },
  });

  const weights: { symbol: string; sectorCode: string; weight: number }[] = [];
  const n = Math.max(1, sectors.length);
  const base = Math.min(RISK_PROFILE.maxSingleName, 1 / n);

  for (const sec of sectors) {
    const candidates = SECTOR_CANDIDATES[sec.sectorCode];
    if (!candidates?.length) continue;

    const snaps = await prisma.qiAssetScoreSnapshot.findMany({
      where: {
        asOfDate,
        modelVersion: QI_MODEL_VERSION,
        asset: { symbol: { in: [...candidates] } },
      },
      orderBy: { rank: "asc" },
      take: 1,
      include: { asset: { select: { symbol: true } } },
    });
    const top = snaps[0];
    if (!top) continue;

    const w = Math.max(RISK_PROFILE.minWeight, Math.min(base, RISK_PROFILE.maxSingleName));
    weights.push({
      symbol: top.asset.symbol,
      sectorCode: sec.sectorCode,
      weight: w,
    });
  }

  const sum = weights.reduce((a, b) => a + b.weight, 0);
  const normalized =
    sum > 0
      ? weights.map((w) => ({ ...w, weight: w.weight / sum }))
      : weights;

  const payload = {
    asOfDate: asOfDate.toISOString().slice(0, 10),
    modelVersion: QI_MODEL_VERSION,
    macroRegime: macro?.regimeLabel ?? null,
    riskRegime: risk?.regimeLabel ?? null,
    weights: normalized,
    sectorsConsidered: sectors.map((s) => ({
      sectorCode: s.sectorCode,
      rank: s.rank,
    })),
  };

  const rec = await prisma.qiRecommendation.create({
    data: {
      validFrom: asOfDate,
      validUntil: null,
      engine: "qi_ts_optimizer",
      modelVersion: QI_MODEL_VERSION,
      status: "active",
      payload: payload as Prisma.InputJsonValue,
    },
  });

  return { asOfDate, recommendationId: rec.id };
}
