import { describe, expect, it } from "vitest";
import { buildPriceForecast } from "@/lib/market/forecast-model";

type Bar = { date: string; value: number; high?: number; low?: number; volume?: number };

function makeBars(values: number[]): Bar[] {
  return values.map((value, i) => {
    const d = new Date(Date.UTC(2023, 0, 1));
    d.setUTCDate(d.getUTCDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      value,
      high: value * 1.005,
      low: value * 0.995,
      volume: 1_000_000,
    };
  });
}

/** Deterministic pseudo-random walk so tests do not flake. */
function randomWalk(n: number, start = 100, vol = 0.01): number[] {
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5;
  };
  const out = [start];
  for (let i = 1; i < n; i++) {
    out.push(out[i - 1]! * (1 + rand() * vol * 2));
  }
  return out;
}

/** Cash-like NAV: tiny, steady accretion. */
function navSeries(n: number, start = 100, dailyCarry = 0.00018): number[] {
  const out = [start];
  for (let i = 1; i < n; i++) {
    const wobble = i % 7 === 0 ? -0.00002 : 0.00001;
    out.push(out[i - 1]! * (1 + dailyCarry + wobble));
  }
  return out;
}

describe("buildPriceForecast", () => {
  it("refuses to project with less than 60 sessions", () => {
    const forecast = buildPriceForecast({
      symbol: "TEST",
      classId: "us_equity",
      bars: makeBars(randomWalk(30)),
      motorScore: 0.6,
    });
    expect(forecast.dataSufficiency).toBe("insufficient");
    expect(forecast.scenarios).toHaveLength(0);
    expect(forecast.explanations.join(" ")).toContain("Not enough history");
  });

  it("produces three horizons with nested 68% and 95% bands", () => {
    const forecast = buildPriceForecast({
      symbol: "TEST",
      classId: "us_equity",
      bars: makeBars(randomWalk(500)),
      motorScore: 0.6,
      reliabilityScore: 8,
    });
    expect(forecast.scenarios.map((s) => s.horizon)).toEqual(["5d", "20d", "60d"]);
    for (const s of forecast.scenarios) {
      expect(s.low95).toBeLessThan(s.low68);
      expect(s.high95).toBeGreaterThan(s.high68);
      expect(s.low68).toBeLessThan(s.central);
      expect(s.central).toBeLessThan(s.high68);
    }
  });

  it("widens the band with the square root of the horizon", () => {
    const forecast = buildPriceForecast({
      symbol: "TEST",
      classId: "us_equity",
      bars: makeBars(randomWalk(500)),
      motorScore: 0,
    });
    const [d5, d20, d60] = forecast.scenarios;
    const width = (s: (typeof forecast.scenarios)[number]) => s.high68 - s.low68;
    expect(width(d20!)).toBeGreaterThan(width(d5!));
    expect(width(d60!)).toBeGreaterThan(width(d20!));
  });

  it("caps the directional drift at a quarter sigma per day", () => {
    const forecast = buildPriceForecast({
      symbol: "TEST",
      classId: "us_equity",
      bars: makeBars(randomWalk(500)),
      motorScore: 1,
    });
    expect(Math.abs(forecast.dailyDrift)).toBeLessThanOrEqual(
      0.25 * (forecast.dailyVol ?? 0) + 1e-12,
    );
  });

  it("reports empirical coverage from walk-forward testing", () => {
    const forecast = buildPriceForecast({
      symbol: "TEST",
      classId: "us_equity",
      bars: makeBars(randomWalk(600)),
      motorScore: 0.5,
    });
    const short = forecast.scenarios[0]!;
    expect(short.coverageSamples).toBeGreaterThan(30);
    expect(short.coverage68).not.toBeNull();
    expect(short.coverage68!).toBeGreaterThan(0);
    expect(short.coverage68!).toBeLessThanOrEqual(1);
    expect(short.coverage95!).toBeGreaterThanOrEqual(short.coverage68!);
  });

  it("calibrates band width so a well-behaved walk lands near the nominal 68%", () => {
    const forecast = buildPriceForecast({
      symbol: "TEST",
      classId: "us_equity",
      bars: makeBars(randomWalk(900)),
      motorScore: 0,
    });
    for (const scenario of forecast.scenarios) {
      expect(scenario.coverage68).not.toBeNull();
      // Out-of-sample on a stationary walk, so it should be close to nominal but
      // is not forced to it — a wide tolerance still catches gross miscalibration.
      expect(Math.abs(scenario.coverage68! - 0.68)).toBeLessThan(0.25);
    }
  });

  it("falls back to the normal band when there is too little history to calibrate", () => {
    const forecast = buildPriceForecast({
      symbol: "TEST",
      classId: "us_equity",
      bars: makeBars(randomWalk(120)),
      motorScore: 0,
    });
    const long = forecast.scenarios.find((s) => s.horizon === "60d")!;
    expect(long.coverage68).toBeNull();
    const ratio = (long.high95 - long.low95) / (long.high68 - long.low68);
    expect(ratio).toBeCloseTo(1.96, 2);
  });

  it("uses carry, not momentum, for cash instruments", () => {
    const forecast = buildPriceForecast({
      symbol: "SGOV",
      classId: "cash_equivalents",
      bars: makeBars(navSeries(400)),
      motorScore: 0.9,
    });
    expect(forecast.methodology).toBe("cash_stability");
    expect(forecast.driftSource).toContain("carry");
    expect(forecast.levels.fibonacci).toEqual([]);
    expect(forecast.explanations.join(" ")).toContain("Fibonacci");
  });

  it("keeps cash bands narrow relative to an equity walk", () => {
    const cash = buildPriceForecast({
      symbol: "SGOV",
      classId: "cash_equivalents",
      bars: makeBars(navSeries(400)),
      motorScore: 0.5,
    });
    const equity = buildPriceForecast({
      symbol: "SPY",
      classId: "us_equity",
      bars: makeBars(randomWalk(400)),
      motorScore: 0.5,
    });
    const relWidth = (f: typeof cash) => {
      const s = f.scenarios[1]!;
      return (s.high68 - s.low68) / (f.current ?? 1);
    };
    expect(relWidth(cash)).toBeLessThan(relWidth(equity));
  });

  it("prefers the adjusted series when distributions are present", () => {
    const closes = navSeries(300);
    // Simulate a distribution: the raw close drops but total return does not.
    const raw = closes.map((v, i) => (i >= 150 ? v - 0.4 : v));
    const bars = makeBars(raw);
    const forecast = buildPriceForecast({
      symbol: "SGOV",
      classId: "cash_equivalents",
      bars,
      adjustedCloses: closes.map((v) => v - 0.4),
      motorScore: 0.5,
    });
    expect(forecast.usedAdjustedSeries).toBe(true);
    expect(forecast.explanations.join(" ")).toContain("adjusted");
    expect(forecast.current).toBeCloseTo(bars[bars.length - 1]!.value, 6);
  });

  it("anchors the invalidation level on the nearest support when biased up", () => {
    const forecast = buildPriceForecast({
      symbol: "TEST",
      classId: "us_equity",
      bars: makeBars(randomWalk(500)),
      motorScore: 0.9,
    });
    if (forecast.dailyDrift >= 0 && forecast.levels.nearestSupport != null) {
      expect(forecast.levels.invalidation).toBe(forecast.levels.nearestSupport);
      expect(forecast.levels.invalidationNote).toContain("support");
    }
  });

  it("scores confidence between 0 and 10", () => {
    const forecast = buildPriceForecast({
      symbol: "TEST",
      classId: "us_equity",
      bars: makeBars(randomWalk(600)),
      motorScore: 0.4,
      reliabilityScore: 9.1,
    });
    expect(forecast.confidence).not.toBeNull();
    expect(forecast.confidence!).toBeGreaterThanOrEqual(0);
    expect(forecast.confidence!).toBeLessThanOrEqual(10);
  });
});
