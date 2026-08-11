import { describe, expect, it } from "vitest";
import {
  buildDecisionNarrative,
  buildDecisionSummary,
  entryValidatedExplanation,
} from "@/lib/motor/decision-summary";
import {
  classScoreProfile,
  neutralScore,
  scoreDomainForClass,
} from "@/lib/motor/score-domain";
import {
  gaugeScaleForClass,
  gaugeBandForValue,
  needleDegreesForScale,
} from "@/lib/motor/gauge-zones";
import { applicableTechnicalRows } from "@/lib/market/indicator-applicability";
import { scoreToSignal, technicalConvergenceSignal } from "@/lib/motor/motor-technicals-summary";
import type { SymbolMotorContext } from "@/lib/motor/snapshot-types";
import type { TechnicalIndicatorRow } from "@/lib/market/technical-summary";

function motorStub(overrides: Partial<SymbolMotorContext> = {}): SymbolMotorContext {
  return {
    classId: "cash_equivalents",
    hasTickerMotor: true,
    hasClassMotor: true,
    motorScope: "ticker",
    ticker: null,
    classSnap: null,
    score: 0.4,
    classScore: 0.52,
    stageLabel: "Hold",
    classStageLabel: "Hold",
    stage: "Maduro",
    entryValidated: true,
    classEntryValidated: true,
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

/** Cash-like NAV: flat with a slow accretion, price sitting mid-band. */
function navBars(n = 260): Array<{ date: string; value: number }> {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2024, 0, 1));
    d.setUTCDate(d.getUTCDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      value: 100 * (1 + 0.0002 * i) + (i % 5 === 0 ? 0.01 : -0.01),
    };
  });
}

describe("score-domain", () => {
  it("marks two-layer classes as unit domain", () => {
    expect(scoreDomainForClass("cash_equivalents")).toBe("unit");
    expect(scoreDomainForClass("us_equity")).toBe("unit");
    expect(scoreDomainForClass("desconhecida")).toBe("signed");
  });

  it("places the neutral point at the peer median for unit domains", () => {
    expect(neutralScore("cash_equivalents")).toBe(0.5);
    expect(neutralScore("desconhecida")).toBe(0);
  });

  it("treats only cash as stability focused", () => {
    expect(classScoreProfile("cash_equivalents").stabilityFocused).toBe(true);
    expect(classScoreProfile("us_equity").stabilityFocused).toBe(false);
  });
});

describe("gauge scales", () => {
  it("never puts a 0–1 rank on a Buy/Sell axis", () => {
    const scale = gaugeScaleForClass("cash_equivalents");
    expect(scale.id).toBe("unit_quality");
    expect(scale.bands.map((b) => b.label)).not.toContain("Buy");
    expect(gaugeBandForValue(scale, 0.4).label).toBe("Abaixo dos pares");
    expect(gaugeBandForValue(scale, 0.55).label).toBe("Na média");
    expect(gaugeBandForValue(scale, 0.1).label).toBe("Fraco");
    expect(gaugeBandForValue(scale, 0.9).label).toBe("Preferido");
  });

  it("maps the unit domain across the full needle sweep", () => {
    const scale = gaugeScaleForClass("cash_equivalents");
    expect(needleDegreesForScale(scale, 0)).toBe(-90);
    expect(needleDegreesForScale(scale, 0.5)).toBe(0);
    expect(needleDegreesForScale(scale, 1)).toBe(90);
  });

  it("keeps the signed directional scale for legacy classes", () => {
    const scale = gaugeScaleForClass("desconhecida");
    expect(scale.id).toBe("signed_directional");
    expect(gaugeBandForValue(scale, 0.25).label).toBe("Buy");
  });
});

describe("scoreToSignal", () => {
  it("does not read a below-median cash rank as Buy", () => {
    expect(scoreToSignal(0.4, "cash_equivalents")).toBe("Neutral");
    expect(scoreToSignal(0.7, "cash_equivalents")).toBe("Buy");
    expect(scoreToSignal(0.1, "cash_equivalents")).toBe("Sell");
  });

  it("keeps signed behaviour without a class", () => {
    expect(scoreToSignal(0.4)).toBe("Buy");
  });
});

describe("technicalConvergenceSignal", () => {
  it("returns neutral on a tie instead of forcing negative", () => {
    const rows: TechnicalIndicatorRow[] = [
      { id: "a", name: "A", value: 1, action: "Buy", group: "oscillator" },
      { id: "b", name: "B", value: 1, action: "Sell", group: "oscillator" },
    ];
    expect(technicalConvergenceSignal(rows)).toBe("neutral");
  });

  it("returns neutral when there is nothing to read", () => {
    expect(technicalConvergenceSignal([])).toBe("neutral");
  });
});

describe("indicator applicability", () => {
  const rows: TechnicalIndicatorRow[] = [
    { id: "rsi_14", name: "RSI", value: 50, action: "Neutral", group: "oscillator" },
    { id: "macd", name: "MACD", value: 0.1, action: "Buy", group: "oscillator" },
    { id: "sma_50", name: "MM50", value: 100, action: "Buy", group: "moving_average" },
    { id: "sma_200", name: "MM200", value: 98, action: "Buy", group: "moving_average" },
  ];

  it("drops momentum oscillators and the 200 period average for cash", () => {
    const result = applicableTechnicalRows(rows, "cash_equivalents");
    expect(result.rows.map((r) => r.id)).toEqual(["sma_50"]);
    expect(result.excluded).toHaveLength(3);
    expect(result.note).toContain("monotônico");
  });

  it("keeps every indicator for directional classes", () => {
    const result = applicableTechnicalRows(rows, "us_equity");
    expect(result.rows).toHaveLength(4);
    expect(result.note).toBeNull();
  });
});

describe("buildDecisionSummary", () => {
  const bars = navBars();

  it("separates allocation, instrument quality and entry for a median cash instrument", () => {
    const decision = buildDecisionSummary({
      motor: motorStub(),
      classId: "cash_equivalents",
      bars,
      price: bars[bars.length - 1]!.value,
      technicalRows: [],
    });

    expect(decision.allocation.stance).toBe("Hold");
    expect(decision.instrument.quality).toBe("Competitive");
    expect(decision.entry.timing).toBe("Neutral");
    expect(decision.gauge.subject).toBe("instrument_quality");
    expect(decision.gauge.value).toBe(0.4);
  });

  it("explains that waiting costs carry rather than reducing risk for cash", () => {
    const decision = buildDecisionSummary({
      motor: motorStub(),
      classId: "cash_equivalents",
      bars,
      price: bars[bars.length - 1]!.value,
      technicalRows: [],
    });
    expect(decision.headline).toContain("necessidade de caixa");
    expect(decision.entry.reasons.join(" ")).toContain("NAV é estável");
  });

  it("blocks new money when the sleeve is being reduced", () => {
    const decision = buildDecisionSummary({
      motor: motorStub({
        classSnap: {
          abaId: "cash_equivalents",
          classId: "cash_equivalents",
          label: "Cash",
          data: "2026-08-10",
          score: 0.2,
          stage: "Descendente",
          stageLabel: "Reduce",
          indicators: [],
          regimeModel: { action: "Reduce", score: 0.2 },
        },
      }),
      classId: "cash_equivalents",
      bars,
      price: bars[bars.length - 1]!.value,
      technicalRows: [],
    });
    expect(decision.allocation.stance).toBe("Reduce");
    expect(decision.entry.timing).toBe("Avoid");
    expect(decision.position.newMoney).toContain("Não aporte");
    expect(decision.position.existing).toContain("reduza");
  });

  it("recommends a better peer when the instrument is weak", () => {
    const decision = buildDecisionSummary({
      motor: motorStub({ score: 0.1 }),
      classId: "cash_equivalents",
      bars,
      price: bars[bars.length - 1]!.value,
      technicalRows: [],
    });
    expect(decision.instrument.quality).toBe("Weak");
    expect(decision.entry.timing).toBe("Wait");
    expect(decision.entry.explanation).toContain("par mais líquido");
  });

  it("reports unknown instrument quality without a ticker score", () => {
    const decision = buildDecisionSummary({
      motor: motorStub({ hasTickerMotor: false, score: null, motorScope: "class" }),
      classId: "cash_equivalents",
      bars,
      price: bars[bars.length - 1]!.value,
      technicalRows: [],
    });
    expect(decision.instrument.quality).toBe("Unknown");
    expect(decision.gauge.value).toBeNull();
  });
});

describe("narrative", () => {
  it("states that validated entry is not a purchase instruction", () => {
    expect(entryValidatedExplanation(true, true)).toContain("não é um sinal");
    expect(entryValidatedExplanation(true, false)).toContain("Não é confirmação técnica");
    expect(entryValidatedExplanation(false, false)).toContain("não validada");
  });

  it("covers motor, price, action and invalidation", () => {
    const bars = navBars();
    const decision = buildDecisionSummary({
      motor: motorStub(),
      classId: "cash_equivalents",
      bars,
      price: bars[bars.length - 1]!.value,
      technicalRows: [],
    });
    const sections = buildDecisionNarrative(decision, {
      classLabel: "Cash",
      symbol: "SGOV",
      entryValidated: true,
    });
    const titles = sections.map((s) => s.title);
    expect(titles).toContain("O que o motor está dizendo");
    expect(titles).toContain("O que o preço está dizendo");
    expect(titles).toContain("O que fazer");
    expect(titles).toContain("O que mudaria esta leitura");
    for (const section of sections) {
      expect(section.body.length).toBeGreaterThan(20);
    }
  });
});
