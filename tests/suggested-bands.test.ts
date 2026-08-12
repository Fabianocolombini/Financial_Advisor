import { describe, expect, it } from "vitest";
import { suggestWalletBands } from "@/lib/wallet/suggested-bands";

function bars(values: number[]) {
  return values.map((value, i) => ({
    date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
    value,
    high: value * 1.01,
    low: value * 0.99,
    open: value,
  }));
}

describe("suggestWalletBands", () => {
  it("does not invent Fibonacci or pivot floors for cash", () => {
    const series = bars(Array.from({ length: 80 }, (_, i) => 100 + i * 0.01));
    const result = suggestWalletBands(series, "cash_equivalents", 100.8);
    const sources = [
      result.floor?.source,
      result.ceiling?.source,
      ...result.supports.map((s) => s.source),
      ...result.resistances.map((s) => s.source),
    ].filter(Boolean);
    expect(sources.every((s) => !/Fibonacci/i.test(s!))).toBe(true);
    expect(result.resistances.length).toBeGreaterThan(0);
    expect(result.resistances.length).toBeLessThanOrEqual(3);
    expect(result.note).toMatch(/Caixa/i);
  });

  it("returns the next floor below price and up to three resistances above it", () => {
    const up = Array.from({ length: 80 }, (_, i) => 100 + i);
    const down = Array.from({ length: 20 }, (_, i) => 180 - i);
    const series = bars([...up, ...down]);
    const last = series[series.length - 1]!.value;
    const result = suggestWalletBands(series, "us_equity", last);
    expect(result.last).toBe(last);
    expect(result.resistances.length).toBeGreaterThan(0);
    expect(result.resistances.length).toBeLessThanOrEqual(3);
    for (const row of result.resistances) {
      expect(row.price).toBeGreaterThan(last);
    }
    if (result.floor) {
      expect(result.floor.price).toBeLessThan(last);
    }
    if (result.ceiling) {
      expect(result.ceiling.price).toBe(result.resistances[0]!.price);
    }
  });
});
