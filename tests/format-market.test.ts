import { describe, expect, it } from "vitest";
import {
  formatUsdCompact,
  formatShareVolumeCompact,
  formatPerf,
} from "@/lib/format-market";
import { scoreToRating, indicatorActionFromContribution } from "@/lib/motor/format-scores";
import { perfFromBars } from "@/lib/market/technical-summary";
import { perfHorizonsFromBars } from "@/lib/market/perf-horizons";

describe("formatUsdCompact", () => {
  it("formats billions and trillions", () => {
    expect(formatUsdCompact(1.77e12)).toBe("1.77 T USD");
    expect(formatUsdCompact(18.67e9)).toBe("19 B USD");
  });

  it("returns dash for null", () => {
    expect(formatUsdCompact(null)).toBe("—");
  });
});

describe("formatShareVolumeCompact", () => {
  it("formats K/M/B", () => {
    expect(formatShareVolumeCompact(1500)).toBe("1.5K");
    expect(formatShareVolumeCompact(12e6)).toBe("12M");
    expect(formatShareVolumeCompact(1.2e9)).toBe("1.2B");
  });
});

describe("scoreToRating", () => {
  it("maps score thresholds", () => {
    expect(scoreToRating(0.6)).toBe("Strong Buy");
    expect(scoreToRating(0.35)).toBe("Buy");
    expect(scoreToRating(0)).toBe("Hold");
    expect(scoreToRating(-0.35)).toBe("Sell");
    expect(scoreToRating(-0.6)).toBe("Strong Sell");
  });
});

describe("indicatorActionFromContribution", () => {
  it("classifies contribution sign", () => {
    expect(indicatorActionFromContribution(0.1)).toBe("Buy");
    expect(indicatorActionFromContribution(-0.1)).toBe("Sell");
    expect(indicatorActionFromContribution(0)).toBe("Neutral");
  });
});

describe("perfFromBars", () => {
  const bars = Array.from({ length: 30 }, (_, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, "0")}`,
    value: 100 + i,
    volume: 1000,
    raw: { timestamp: i, close: 100 + i, volume: 1000 },
  }));

  it("computes percent change over lookback", () => {
    const pct = perfFromBars(bars, 5);
    expect(pct).not.toBeNull();
    expect(pct!).toBeGreaterThan(0);
  });
});

describe("perfHorizonsFromBars", () => {
  it("returns all horizon keys", () => {
    const bars = Array.from({ length: 30 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, "0")}`,
      value: 100 + i,
      volume: 1000,
      raw: { timestamp: i, close: 100 + i, volume: 1000 },
    }));
    const h = perfHorizonsFromBars(bars);
    expect(h["1d"]).not.toBeNull();
    expect(h["15d"]).not.toBeNull();
    expect(h["6m"]).toBeNull();
    expect(h["1y"]).toBeNull();
    expect(h["2y"]).not.toBeNull();
  });

  it("computes 6M and 1A when the series is long enough", () => {
    const bars = Array.from({ length: 260 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, "0")}`,
      value: 100 + i,
      volume: 1000,
      raw: { timestamp: i, close: 100 + i, volume: 1000 },
    }));
    const h = perfHorizonsFromBars(bars);
    expect(h["6m"]).not.toBeNull();
    expect(h["1y"]).not.toBeNull();
    expect(h["6m"]!).toBeCloseTo(((259 - 133) / (100 + 133)) * 100, 5);
  });
});

describe("formatPerf", () => {
  it("adds plus sign for positive", () => {
    expect(formatPerf(1.5)).toBe("+1.50%");
    expect(formatPerf(-2)).toBe("-2.00%");
  });
});
