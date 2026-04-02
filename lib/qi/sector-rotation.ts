import { Prisma } from "@prisma/client";

import { QI_MODEL_VERSION, SECTOR_ETFS } from "@/lib/qi/constants";
import { getDailyCloses, totalReturn } from "@/lib/qi/price-series";
import { utcDateOnly } from "@/lib/qi/regime-engine";
import { prisma } from "@/lib/prisma";

const LOOKBACK = 63;

/** Viés por regime macro (sector ETF code → -1..1). */
const REGIME_BIAS: Record<string, Partial<Record<string, number>>> = {
  STRESS: { XLU: 0.85, XLP: 0.65, XLK: -0.45, XLY: -0.35, XLE: -0.2 },
  EASY: { XLK: 0.75, XLY: 0.55, XLF: 0.35, XLU: -0.25 },
  NEUTRAL: {},
  TIGHT_FINANCIAL: { XLF: -0.4, XLK: -0.2, XLU: 0.4 },
  INFLATIONARY: { XLE: 0.5, XLB: 0.35, XLP: 0.25, XLK: -0.3 },
};

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export async function runSectorRotation(asOf: Date): Promise<{
  asOfDate: Date;
  rows: number;
}> {
  const asOfDate = utcDateOnly(asOf);
  let macro = await prisma.qiRegimeSnapshot.findFirst({
    where: {
      kind: "MACRO",
      asOfDate,
      modelVersion: QI_MODEL_VERSION,
    },
    select: { regimeLabel: true },
  });
  if (!macro) {
    macro = await prisma.qiRegimeSnapshot.findFirst({
      where: { kind: "MACRO", modelVersion: QI_MODEL_VERSION },
      orderBy: { asOfDate: "desc" },
      select: { regimeLabel: true },
    });
  }
  const label = macro?.regimeLabel ?? "NEUTRAL";
  const bias = REGIME_BIAS[label] ?? {};

  const spy = await getDailyCloses("SPY", asOf, 300);
  const spyMom = totalReturn(spy, LOOKBACK);

  const scored: {
    sectorCode: string;
    composite: number;
    components: Record<string, unknown>;
  }[] = [];

  for (const s of SECTOR_ETFS) {
    const etf = await getDailyCloses(s.symbol, asOf, 300);
    const mom = totalReturn(etf, LOOKBACK);
    let rel = 0;
    if (
      mom != null &&
      spyMom != null &&
      Math.abs(spyMom) > 1e-6
    ) {
      rel = mom / spyMom - 1;
    }
    const rb = bias[s.sectorCode] ?? 0;
    const raw =
      (mom ?? 0) * 0.38 +
      rel * 0.32 +
      rb * 0.3;
    const composite = clamp(raw, -1.5, 1.5);
    scored.push({
      sectorCode: s.sectorCode,
      composite,
      components: {
        momentum63d: mom,
        relVsSpy: rel,
        regimeBias: rb,
        macroLabel: label,
      },
    });
  }

  scored.sort((a, b) => b.composite - a.composite);

  let rank = 1;
  for (const row of scored) {
    await prisma.qiSectorScoreSnapshot.upsert({
      where: {
        sectorCode_asOfDate_modelVersion: {
          sectorCode: row.sectorCode,
          asOfDate,
          modelVersion: QI_MODEL_VERSION,
        },
      },
      create: {
        sectorCode: row.sectorCode,
        asOfDate,
        modelVersion: QI_MODEL_VERSION,
        compositeScore: new Prisma.Decimal(row.composite),
        rank,
        regimeTag: label,
        components: row.components as Prisma.InputJsonValue,
      },
      update: {
        compositeScore: new Prisma.Decimal(row.composite),
        rank,
        regimeTag: label,
        components: row.components as Prisma.InputJsonValue,
      },
    });
    rank += 1;
  }

  return { asOfDate, rows: scored.length };
}
