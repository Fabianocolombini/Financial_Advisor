import { describe, expect, it } from "vitest";
import {
  adxSeries,
  awesomeOscillatorSeries,
  bullBearPowerSeries,
  cciSeries,
  computeIndicatorSeries,
  emaSeriesOf,
  hullMaSeries,
  ichimokuSeries,
  macdSeries,
  momentumSeries,
  rsiSeries,
  smaSeriesOf,
  stochasticRsiSeries,
  stochasticSeries,
  ultimateOscillatorSeries,
  vwmaSeries,
  williamsRSeries,
  type IndicatorBar,
} from "@/lib/market/technical-indicators";
import { computeTechnicalAnalysis, countsToSignedGauge } from "@/lib/market/technical-summary";

/** Deterministic OHLC series so the expectations never flake. */
function makeBars(closes: number[]): IndicatorBar[] {
  return closes.map((close, i) => ({
    date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
    value: close,
    open: close * 0.999,
    high: close * 1.01,
    low: close * 0.99,
    volume: 1_000_000 + i * 1000,
  }));
}

function ramp(n: number, start = 100, step = 1): number[] {
  return Array.from({ length: n }, (_, i) => start + i * step);
}

function lastOf(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v != null) return v;
  }
  return null;
}

describe("smoothing primitives", () => {
  it("computes a simple moving average over the exact window", () => {
    const out = smaSeriesOf([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBe(2);
    expect(out[4]).toBe(4);
  });

  it("seeds the EMA with a simple average and only emits after warm-up", () => {
    const out = emaSeriesOf([1, 2, 3, 4, 5], 3);
    expect(out[1]).toBeNull();
    expect(out[2]).toBe(2);
    // (4 - 2) * 0.5 + 2
    expect(out[3]).toBeCloseTo(3, 10);
  });

  it("does not average across a gap in the input", () => {
    const out = smaSeriesOf([1, 2, null, 4, 5, 6], 3);
    expect(out[3]).toBeNull();
    expect(out[5]).toBe(5);
  });
});

describe("oscillators", () => {
  it("returns 100 for RSI on a series that only rises", () => {
    expect(lastOf(rsiSeries(ramp(60)))).toBe(100);
  });

  it("returns 0 for RSI on a series that only falls", () => {
    expect(lastOf(rsiSeries(ramp(60, 200, -1)))).toBe(0);
  });

  it("keeps RSI inside 0-100 on a mixed series", () => {
    const closes = ramp(120).map((v, i) => v + Math.sin(i / 3) * 5);
    for (const v of rsiSeries(closes)) {
      if (v == null) continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("pins the stochastic to the top of its range at a new high", () => {
    const closes = ramp(40);
    const highs = closes.map((c) => c);
    const lows = closes.map((c) => c - 5);
    const { k, d } = stochasticSeries(closes, highs, lows, 14, 3, 3);
    expect(lastOf(k)).toBeCloseTo(100, 6);
    expect(lastOf(d)).toBeCloseTo(100, 6);
  });

  it("smooths %K before %D, so %D lags on a turn", () => {
    const closes = [...ramp(30), ...ramp(10, 129, -3)];
    const highs = closes.map((c) => c + 1);
    const lows = closes.map((c) => c - 1);
    const { k, d } = stochasticSeries(closes, highs, lows, 14, 3, 3);
    expect(lastOf(k)!).toBeLessThan(lastOf(d)!);
  });

  it("computes Williams %R as a negative-scale mirror of the stochastic", () => {
    const closes = ramp(40);
    const highs = closes.map((c) => c + 2);
    const lows = closes.map((c) => c - 2);
    const wr = lastOf(williamsRSeries(closes, highs, lows, 14))!;
    expect(wr).toBeGreaterThanOrEqual(-100);
    expect(wr).toBeLessThanOrEqual(0);
    const { k } = stochasticSeries(closes, highs, lows, 14, 1, 1);
    expect(wr + 100).toBeCloseTo(lastOf(k)!, 6);
  });

  it("keeps ADX non-negative and +DI above -DI in a clean uptrend", () => {
    const bars = makeBars(ramp(120));
    const { adx, plusDi, minusDi } = adxSeries(
      bars.map((b) => b.value),
      bars.map((b) => b.high!),
      bars.map((b) => b.low!),
      14,
    );
    expect(lastOf(adx)!).toBeGreaterThan(0);
    expect(lastOf(plusDi)!).toBeGreaterThan(lastOf(minusDi)!);
  });

  it("makes the awesome oscillator positive when the fast median leads", () => {
    const bars = makeBars(ramp(80));
    const ao = awesomeOscillatorSeries(
      bars.map((b) => b.high!),
      bars.map((b) => b.low!),
    );
    expect(lastOf(ao)!).toBeGreaterThan(0);
  });

  it("computes momentum as the raw difference over the lookback", () => {
    expect(lastOf(momentumSeries(ramp(30), 10))).toBe(10);
  });

  it("puts MACD above its signal while a trend accelerates", () => {
    const closes = ramp(120).map((v, i) => v + i * i * 0.01);
    const { macd, signal, histogram } = macdSeries(closes);
    expect(lastOf(macd)!).toBeGreaterThan(lastOf(signal)!);
    expect(lastOf(histogram)!).toBeGreaterThan(0);
  });

  it("bounds the stochastic RSI to 0-100", () => {
    const closes = ramp(150).map((v, i) => v + Math.sin(i / 5) * 8);
    for (const v of stochasticRsiSeries(closes).k) {
      if (v == null) continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("splits bull and bear power around the EMA", () => {
    const bars = makeBars(ramp(60));
    const { power, bull, bear } = bullBearPowerSeries(
      bars.map((b) => b.value),
      bars.map((b) => b.high!),
      bars.map((b) => b.low!),
      13,
    );
    expect(lastOf(bull)!).toBeGreaterThan(lastOf(bear)!);
    expect(lastOf(power)!).toBeCloseTo(lastOf(bull)! + lastOf(bear)!, 8);
  });

  it("bounds the ultimate oscillator to 0-100", () => {
    const bars = makeBars(ramp(120).map((v, i) => v + Math.cos(i / 4) * 6));
    const uo = ultimateOscillatorSeries(
      bars.map((b) => b.value),
      bars.map((b) => b.high!),
      bars.map((b) => b.low!),
    );
    const v = lastOf(uo)!;
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  });

  it("keeps CCI near zero when price tracks its own average", () => {
    const flat = new Array(60).fill(100);
    const cci = cciSeries(flat, flat, flat, 20);
    expect(lastOf(cci)).toBe(0);
  });
});

describe("moving averages", () => {
  it("weights VWMA toward the higher-volume sessions", () => {
    const closes = [...new Array(19).fill(100), 200];
    const volumes = [...new Array(19).fill(1), 100];
    const vwma = lastOf(vwmaSeries(closes, volumes, 20))!;
    const sma = lastOf(smaSeriesOf(closes, 20))!;
    expect(vwma).toBeGreaterThan(sma);
  });

  it("leaves VWMA undefined when the window has no volume", () => {
    const closes = ramp(40);
    expect(lastOf(vwmaSeries(closes, new Array(40).fill(0), 20))).toBeNull();
  });

  it("makes the Hull average lead a simple average on a ramp", () => {
    const closes = ramp(60);
    expect(lastOf(hullMaSeries(closes, 9))!).toBeGreaterThan(
      lastOf(smaSeriesOf(closes, 9))!,
    );
  });

  it("computes the Ichimoku base as the midpoint of its window", () => {
    const closes = ramp(80);
    const highs = closes.map((c) => c + 1);
    const lows = closes.map((c) => c - 1);
    const { base, conversion } = ichimokuSeries(highs, lows, 9, 26, 52);
    const last = closes.length - 1;
    expect(base[last]).toBeCloseTo(
      (highs[last]! + lows[last - 25]!) / 2,
      6,
    );
    // The shorter window sits closer to price in a trend.
    expect(conversion[last]!).toBeGreaterThan(base[last]!);
  });
});

describe("technical summary", () => {
  it("emits 11 oscillators and 15 moving averages", () => {
    const { rows } = computeTechnicalAnalysis(makeBars(ramp(300)));
    expect(rows.filter((r) => r.group === "oscillator")).toHaveLength(11);
    expect(rows.filter((r) => r.group === "moving_average")).toHaveLength(15);
  });

  it("returns nothing without enough history", () => {
    expect(computeTechnicalAnalysis(makeBars(ramp(10))).rows).toHaveLength(0);
  });

  it("rates every moving average Buy when price leads all of them", () => {
    const { rows } = computeTechnicalAnalysis(makeBars(ramp(300)));
    const mas = rows.filter(
      (r) => r.group === "moving_average" && r.id !== "ichimoku_base" && r.value != null,
    );
    expect(mas.every((r) => r.action === "Buy")).toBe(true);
  });

  it("keeps an extended RSI Neutral instead of calling it a Sell", () => {
    // A relentless uptrend leaves RSI above 70 and still rising: overbought is
    // not a sell signal until momentum actually turns.
    const { rows } = computeTechnicalAnalysis(makeBars(ramp(300)));
    const rsi = rows.find((r) => r.id === "rsi_14")!;
    expect(rsi.value).toBeGreaterThan(70);
    expect(rsi.action).toBe("Neutral");
  });

  it("aligns each row with the last point of its own series", () => {
    const bars = makeBars(ramp(300));
    const { rows, series } = computeTechnicalAnalysis(bars);
    for (const row of rows) {
      const s = series.find((x) => x.id === row.id)!;
      expect(row.value).toBe(lastOf(s.values));
    }
  });

  it("exposes reference levels for the bounded oscillators", () => {
    const series = computeIndicatorSeries(makeBars(ramp(300)));
    const rsi = series.find((s) => s.id === "rsi_14")!;
    expect(rsi.levels.map((l) => l.value).sort((a, b) => a - b)).toEqual([30, 70]);
    expect(rsi.pane).toBe("separate");
    const sma = series.find((s) => s.id === "sma_20")!;
    expect(sma.pane).toBe("price");
  });

  it("falls back to close when the feed has no intraday range", () => {
    const closeOnly = ramp(300).map((close, i) => ({
      date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
      value: close,
    }));
    const { rows } = computeTechnicalAnalysis(closeOnly);
    expect(rows.find((r) => r.id === "williams_r")!.value).not.toBeNull();
  });
});

describe("countsToSignedGauge", () => {
  it("maps unanimous Buy to +1 and unanimous Sell to -1", () => {
    expect(countsToSignedGauge({ buy: 11, sell: 0, neutral: 0 })).toBe(1);
    expect(countsToSignedGauge({ buy: 0, sell: 15, neutral: 0 })).toBe(-1);
  });

  it("sits at Neutral when Buy and Sell cancel, even with Neutral votes", () => {
    expect(countsToSignedGauge({ buy: 2, sell: 2, neutral: 7 })).toBe(0);
  });

  it("returns null when there is nothing to tally", () => {
    expect(countsToSignedGauge({ buy: 0, sell: 0, neutral: 0 })).toBeNull();
  });
});
