import { describe, expect, it } from "vitest";
import { computeDecisionReliability, DECISION_TARGET_SCORE } from "@/lib/motor/reliability-audit";
import { buildClassDataEquation } from "@/lib/motor/class-data-equation";
import type { SymbolMotorContext } from "@/lib/motor/snapshot-types";

const baseMotor: SymbolMotorContext = {
  classId: "us_equity",
  hasTickerMotor: true,
  hasClassMotor: true,
  motorScope: "ticker",
  ticker: {
    symbol: "SPY",
    abaId: "us_equity",
    classId: "us_equity",
    data: "2026-08-07",
    score: 0.4,
    stage: "Ascendente",
    stageLabel: "Accumulate",
    indicators: [],
    allIndicators: [
      { id: "rsi_14", name: "RSI", value: 55, contribution: 0.1 },
      { id: "preco_vs_mm50", name: "MM50", value: 0.02, contribution: 0.08 },
      { id: "preco_vs_mm200", name: "MM200", value: 0.05, contribution: 0.07 },
      { id: "volume_vs_media", name: "Vol", value: 0.1, contribution: 0.05 },
      { id: "vol_realizada", name: "VolR", value: 0.15, contribution: 0.04 },
    ],
  },
  classSnap: {
    abaId: "us_equity",
    classId: "us_equity",
    label: "US Equity",
    data: "2026-08-07",
    score: 0.35,
    stage: "Ascendente",
    stageLabel: "Accumulate",
    indicators: [],
    allIndicators: [
      { id: "vix", name: "VIX", value: 18, contribution: 0.12 },
      { id: "pe_ratio", name: "PE", value: 25, contribution: 0.1 },
      { id: "cape_shiller", name: "CAPE", value: 35, contribution: 0.08 },
      { id: "put_call_ratio", name: "PCR", value: 0.9, contribution: 0.06 },
      { id: "aaii_sentiment", name: "AAII", value: 40, contribution: 0.05 },
    ],
  },
  score: 0.4,
  classScore: 0.35,
  stageLabel: "Accumulate",
  classStageLabel: "Accumulate",
  stage: "Ascendente",
  entryValidated: true,
  classEntryValidated: true,
  divergesFromClass: false,
  dominantIndicator: { id: "rsi_14", name: "RSI", contribution: 0.1 },
  classDominantIndicator: { id: "vix", name: "VIX", contribution: 0.12 },
  rationale: [],
  classRationale: [],
  indicators: [],
  classIndicators: [],
  tickerIndicators: [],
  classScoreHistory: [{ date: "2026-08-01", score: 0.3 }],
  tickerScoreHistory: [],
  decision: {},
  perf1dPct: 1,
  perf7dPct: 2,
  perf15dPct: 3,
  perf1mPct: 4,
};

describe("computeDecisionReliability", () => {
  it("targets score 8 as threshold", () => {
    expect(DECISION_TARGET_SCORE).toBe(8);
  });

  it("scores strong when motor + snapshot healthy", () => {
    const audit = computeDecisionReliability({
      motor: baseMotor,
      snapshot: {
        asOf: "2026-08-07",
        classes: {},
        tickers: {},
        models: { regime: { regime_risk_probability: 0.3, calibrated: true } },
        quality: { ok: true },
      },
      quote: { symbol: "SPY", price: 500, error: undefined } as never,
      classId: "us_equity",
    });
    expect(audit.score).toBeGreaterThanOrEqual(7);
    expect(audit.factors.length).toBeGreaterThan(5);
  });
});

describe("buildClassDataEquation", () => {
  it("builds question rows for us_equity", () => {
    const eq = buildClassDataEquation(
      "us_equity",
      baseMotor.classSnap!.allIndicators!,
      baseMotor.ticker!.allIndicators!,
    );
    expect(eq.questions.length).toBe(5);
    expect(eq.role).toContain("US equity");
  });
});
