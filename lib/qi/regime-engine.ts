import { Prisma } from "@prisma/client";

import { QI_MODEL_VERSION } from "@/lib/qi/constants";
import { buildMacroDerivedSnapshot } from "@/lib/qi/macro-derived";
import { prisma } from "@/lib/prisma";

export function utcDateOnly(d: Date): Date {
  const s = d.toISOString().slice(0, 10);
  return new Date(`${s}T12:00:00.000Z`);
}

type MacroLabel =
  | "STRESS"
  | "EASY"
  | "NEUTRAL"
  | "TIGHT_FINANCIAL"
  | "INFLATIONARY";

function classifyMacro(
  m: Awaited<ReturnType<typeof buildMacroDerivedSnapshot>>,
): { label: MacroLabel; score: Prisma.Decimal } {
  const vix = m.vix;
  const nfci = m.nfci;
  const stressHy =
    vix != null &&
    vix > 30 &&
    m.hyCreditSpread != null &&
    m.hyCreditSpread > 500;

  if (stressHy || (vix != null && vix > 22)) {
    return { label: "STRESS", score: new Prisma.Decimal("1") };
  }
  if (vix != null && vix < 15 && nfci != null && nfci < 0) {
    return { label: "EASY", score: new Prisma.Decimal("-1") };
  }
  if (nfci != null && nfci > 0.5) {
    return { label: "TIGHT_FINANCIAL", score: new Prisma.Decimal("0.5") };
  }
  if (
    m.cpiYoyPercent != null &&
    m.cpiYoyPercent > 4 &&
    m.fedFundsRising === true
  ) {
    return { label: "INFLATIONARY", score: new Prisma.Decimal("0.3") };
  }
  return { label: "NEUTRAL", score: new Prisma.Decimal("0") };
}

type RiskLabel = "RISK_OFF" | "RISK_ON" | "NEUTRAL";

function classifyRisk(vix: number | null, spyDrawdown: number | null): RiskLabel {
  if (vix != null && vix > 28) return "RISK_OFF";
  if (spyDrawdown == null) {
    if (vix != null && vix > 22) return "RISK_OFF";
    if (vix != null && vix < 16) return "RISK_ON";
    return "NEUTRAL";
  }
  if (spyDrawdown < -0.18 && vix != null && vix > 20) return "RISK_OFF";
  if (spyDrawdown > -0.05 && vix != null && vix < 18) return "RISK_ON";
  return "NEUTRAL";
}

/** Drawdown vs máximo rolante (~252 sessões) a partir de preços diários. */
export async function computeSpyDrawdown252(
  asOf: Date,
): Promise<number | null> {
  const asset = await prisma.qiAsset.findUnique({
    where: { symbol: "SPY" },
    select: { id: true },
  });
  if (!asset) return null;
  const rows = await prisma.qiMarketPriceDaily.findMany({
    where: { assetId: asset.id, tradeDate: { lte: utcDateOnly(asOf) } },
    orderBy: { tradeDate: "desc" },
    take: 260,
    select: { close: true },
  });
  if (rows.length < 20) return null;
  const closes = rows.map((r) => Number(r.close));
  const last = closes[0]!;
  let peak = last;
  for (const c of closes) {
    if (c > peak) peak = c;
  }
  if (peak <= 0) return null;
  return last / peak - 1;
}

export type RunRegimeEngineResult = {
  asOfDate: Date;
  modelVersion: string;
  macroLabel: string;
  riskLabel: string;
};

export async function runRegimeEngine(asOf: Date): Promise<RunRegimeEngineResult> {
  const asOfDate = utcDateOnly(asOf);
  const derived = await buildMacroDerivedSnapshot();
  const { label: macroLabel, score: macroScore } = classifyMacro(derived);
  const spyDd = await computeSpyDrawdown252(asOf);
  const riskLabel = classifyRisk(derived.vix, spyDd);

  const macroComponents = {
    ...derived,
    rules:
      "stress: vix>22 ou (vix>30 e HY>500); easy: vix<15 e nfci<0; tight: nfci>0.5; inflation: cpiYoY>4 e fed subindo",
    macroLabel,
  };

  await prisma.qiRegimeSnapshot.upsert({
    where: {
      kind_asOfDate_modelVersion: {
        kind: "MACRO",
        asOfDate,
        modelVersion: QI_MODEL_VERSION,
      },
    },
    create: {
      kind: "MACRO",
      asOfDate,
      modelVersion: QI_MODEL_VERSION,
      regimeLabel: macroLabel,
      compositeScore: macroScore,
      components: macroComponents as Prisma.InputJsonValue,
    },
    update: {
      regimeLabel: macroLabel,
      compositeScore: macroScore,
      components: macroComponents as Prisma.InputJsonValue,
    },
  });

  const riskComponents = {
    vix: derived.vix,
    spyDrawdown252: spyDd,
    riskLabel,
  };

  await prisma.qiRegimeSnapshot.upsert({
    where: {
      kind_asOfDate_modelVersion: {
        kind: "RISK",
        asOfDate,
        modelVersion: QI_MODEL_VERSION,
      },
    },
    create: {
      kind: "RISK",
      asOfDate,
      modelVersion: QI_MODEL_VERSION,
      regimeLabel: riskLabel,
      compositeScore: null,
      components: riskComponents as Prisma.InputJsonValue,
    },
    update: {
      regimeLabel: riskLabel,
      components: riskComponents as Prisma.InputJsonValue,
    },
  });

  return {
    asOfDate,
    modelVersion: QI_MODEL_VERSION,
    macroLabel,
    riskLabel,
  };
}
