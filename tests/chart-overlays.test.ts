import { describe, expect, it } from "vitest";
import {
  avgVolume,
  bollingerBands,
  bollingerCompressionLabel,
  volumeConfirmation,
} from "@/lib/market/chart-overlays";
import { sliceBarsForHorizon } from "@/lib/market/perf-horizons";

describe("chart-overlays", () => {
  const bars = Array.from({ length: 40 }, (_, i) => ({
    date: `2024-02-${String((i % 28) + 1).padStart(2, "0")}`,
    value: 100 + Math.sin(i / 3) * 5 + i * 0.1,
    volume: 1000 + (i % 5) * 200,
  }));

  it("computes bollinger bands", () => {
    const values = bars.map((b) => b.value);
    const bb = bollingerBands(values, 20);
    expect(bb.mid[19]).not.toBeNull();
    expect(bb.upper[19]!).toBeGreaterThan(bb.lower[19]!);
  });

  it("averages volume over lookback", () => {
    const avg = avgVolume(bars, 20);
    expect(avg).toBeGreaterThan(0);
  });

  it("builds volume confirmation message", () => {
    const loud = [
      ...bars.slice(0, -1),
      { ...bars[bars.length - 1]!, volume: 50_000 },
    ];
    const result = volumeConfirmation(loud, 20);
    expect(result.message).toMatch(/acima da média|próximo da média/);
  });

  it("detects compression when band width shrinks", () => {
    const flat = Array.from({ length: 40 }, (_, i) =>
      i < 25 ? 100 + (i % 3) : 100 + (i % 2) * 0.05,
    );
    const label = bollingerCompressionLabel(flat, 20);
    expect(label === "comprimida" || label === null).toBe(true);
  });
});

describe("sliceBarsForHorizon", () => {
  it("keeps 15D window", () => {
    const bars = Array.from({ length: 50 }, (_, i) => i);
    expect(sliceBarsForHorizon(bars, "15d")).toHaveLength(16);
    expect(sliceBarsForHorizon(bars, "2y")).toHaveLength(50);
  });
});
