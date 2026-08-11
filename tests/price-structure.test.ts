import { describe, expect, it } from "vitest";
import {
  atr,
  bollingerPosition,
  ewmaVol,
  fibonacciLevels,
  realizedVol,
  supportResistance,
  swingPivots,
  trendState,
} from "@/lib/market/price-structure";

function flatSeries(n: number, value = 100): number[] {
  return new Array(n).fill(value);
}

function risingSeries(n: number, start = 100, step = 0.5): number[] {
  return Array.from({ length: n }, (_, i) => start + i * step);
}

function bars(values: number[]): Array<{ date: string; value: number }> {
  return values.map((value, i) => ({
    date: new Date(2024, 0, i + 1).toISOString().slice(0, 10),
    value,
  }));
}

describe("bollingerPosition", () => {
  it("returns unknown when history is shorter than the period", () => {
    expect(bollingerPosition(flatSeries(5)).zone).toBe("unknown");
  });

  it("puts a price at the middle of a flat band", () => {
    const pos = bollingerPosition([...flatSeries(20, 100)]);
    expect(pos.zone).toBe("unknown");
  });

  it("detects a price stretched above the upper band", () => {
    const values = [...flatSeries(25, 100), 130];
    const pos = bollingerPosition(values);
    expect(pos.percentB).not.toBeNull();
    expect(pos.zone).toBe("above_upper");
  });

  it("detects a price in the lower half after a drop", () => {
    const values = [...risingSeries(40, 100, 1), 118];
    const pos = bollingerPosition(values);
    expect(pos.zone === "lower_half" || pos.zone === "below_lower").toBe(true);
  });
});

describe("trendState", () => {
  it("identifies an uptrend in a monotonic series", () => {
    expect(trendState(risingSeries(120)).direction).toBe("up");
  });

  it("identifies a downtrend in a falling series", () => {
    expect(trendState(risingSeries(120, 200, -0.5)).direction).toBe("down");
  });

  it("returns unknown without enough history", () => {
    expect(trendState(flatSeries(10)).direction).toBe("unknown");
  });
});

describe("swingPivots", () => {
  it("finds a confirmed high and low", () => {
    const values = [10, 11, 12, 13, 14, 20, 14, 13, 12, 11, 5, 11, 12, 13, 14, 15, 16];
    const pivots = swingPivots(bars(values), 3);
    expect(pivots.some((p) => p.kind === "high" && p.price === 20)).toBe(true);
    expect(pivots.some((p) => p.kind === "low" && p.price === 5)).toBe(true);
  });

  it("never reports a pivot in the unconfirmed tail", () => {
    const values = risingSeries(50);
    const pivots = swingPivots(bars(values), 5);
    for (const pivot of pivots) {
      expect(pivot.index).toBeLessThanOrEqual(values.length - 6);
    }
  });
});

describe("supportResistance", () => {
  it("splits levels around the current price", () => {
    const values = [10, 12, 18, 12, 10, 8, 4, 8, 10, 12, 16, 12, 10, 11, 12, 13, 11];
    const levels = supportResistance(bars(values), 11, 180, 3);
    for (const s of levels.supports) expect(s).toBeLessThan(11);
    for (const r of levels.resistances) expect(r).toBeGreaterThan(11);
  });
});

describe("volatility", () => {
  it("returns zero volatility for a flat series", () => {
    expect(realizedVol(flatSeries(60))).toBe(0);
  });

  it("computes a positive EWMA volatility for a noisy series", () => {
    const values = Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i) * 5);
    expect(ewmaVol(values)).toBeGreaterThan(0);
  });

  it("needs at least 20 returns for EWMA", () => {
    expect(ewmaVol(flatSeries(10))).toBeNull();
  });
});

describe("atr", () => {
  it("uses high/low when available", () => {
    const withOhlc = Array.from({ length: 30 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, "0")}`,
      value: 100,
      high: 102,
      low: 98,
    }));
    expect(atr(withOhlc, 14)).toBeCloseTo(4, 5);
  });

  it("falls back to close-to-close when OHLC is absent", () => {
    expect(atr(bars(flatSeries(30)), 14)).toBe(0);
  });
});

describe("fibonacciLevels", () => {
  it("skips shallow swings", () => {
    expect(fibonacciLevels(100, 101)).toEqual([]);
  });

  it("produces retracements between the swing bounds", () => {
    const levels = fibonacciLevels(100, 200);
    const retracements = levels.filter((l) => l.kind === "retracement");
    expect(retracements).toHaveLength(5);
    for (const level of retracements) {
      expect(level.price).toBeGreaterThanOrEqual(100);
      expect(level.price).toBeLessThanOrEqual(200);
    }
    expect(levels.some((l) => l.kind === "extension" && l.price > 200)).toBe(true);
  });
});
