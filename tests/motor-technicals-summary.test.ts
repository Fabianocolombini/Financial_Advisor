import { describe, expect, it } from "vitest";
import {
  buildConvergenceSummary,
  macroLayerSignal,
  scoreToSignal,
  technicalConvergenceSignal,
} from "@/lib/motor/motor-technicals-summary";
import type { TechnicalIndicatorRow } from "@/lib/market/technical-summary";
import type { SymbolMotorContext } from "@/lib/motor/snapshot-types";

function motorStub(overrides: Partial<SymbolMotorContext> = {}): SymbolMotorContext {
  return {
    classId: "cash_equivalents",
    hasTickerMotor: true,
    hasClassMotor: true,
    motorScope: "ticker",
    ticker: null,
    classSnap: null,
    score: -0.4,
    classScore: -0.2,
    stageLabel: "Reduce",
    classStageLabel: "Hold",
    stage: null,
    entryValidated: false,
    classEntryValidated: false,
    divergesFromClass: false,
    dominantIndicator: null,
    classDominantIndicator: null,
    rationale: [],
    classRationale: [],
    indicators: [],
    classIndicators: [],
    tickerIndicators: [],
    classScoreHistory: [],
    tickerScoreHistory: [],
    decision: {},
    perf1dPct: null,
    perf7dPct: null,
    perf15dPct: null,
    perf1mPct: null,
    ...overrides,
  };
}

describe("motor-technicals-summary", () => {
  it("maps score to signal bands", () => {
    expect(scoreToSignal(0.5)).toBe("Buy");
    expect(scoreToSignal(-0.5)).toBe("Sell");
    expect(scoreToSignal(0)).toBe("Neutral");
  });

  it("derives technical convergence from TA counts", () => {
    const rows: TechnicalIndicatorRow[] = [
      { id: "a", name: "A", value: 1, action: "Buy", group: "oscillator" },
      { id: "b", name: "B", value: 1, action: "Buy", group: "oscillator" },
      { id: "c", name: "C", value: 1, action: "Sell", group: "oscillator" },
    ];
    expect(technicalConvergenceSignal(rows)).toBe("positive");
  });

  it("builds summary for divergent motor vs technical", () => {
    const text = buildConvergenceSummary("positive", "negative", false);
    expect(text).toContain("técnica");
  });

  it("uses class score for macro when no regime action", () => {
    expect(macroLayerSignal(motorStub({ classScore: -0.3 }))).toBe("Sell");
  });
});
