import { describe, expect, it } from "vitest";
import { runMonteCarlo } from "@/lib/market/monte-carlo";

function walk(n: number, start = 100, daily = 0.001): number[] {
  const out = [start];
  for (let i = 1; i < n; i++) out.push(out[i - 1]! * (1 + daily));
  return out;
}

describe("runMonteCarlo", () => {
  it("returns nothing without enough history", () => {
    expect(runMonteCarlo({ closes: walk(10) })).toBeNull();
  });

  it("is deterministic for the same seed inputs", () => {
    const closes = walk(80, 100, 0.0005);
    const a = runMonteCarlo({ closes, symbol: "SPY", asOf: "2026-08-17" });
    const b = runMonteCarlo({ closes, symbol: "SPY", asOf: "2026-08-17" });
    expect(a?.scenarios[0]?.median).toBe(b?.scenarios[0]?.median);
    expect(a?.scenarios[0]?.low68).toBe(b?.scenarios[0]?.low68);
  });

  it("nests 68% inside 95% and widens with horizon", () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648 - 0.5;
    };
    const closes = [100];
    for (let i = 1; i < 300; i++) {
      closes.push(closes[i - 1]! * (1 + rand() * 0.02));
    }
    const run = runMonteCarlo({
      closes,
      symbol: "TEST",
      asOf: "2026-01-01",
    });
    expect(run).not.toBeNull();
    expect(run!.scenarios.map((s) => s.horizon)).toEqual([
      "5d",
      "15d",
      "21d",
      "63d",
      "126d",
    ]);
    const w = (s: (typeof run)["scenarios"][number]) => s.high68 - s.low68;
    for (const s of run!.scenarios) {
      expect(s.low95).toBeLessThan(s.low68);
      expect(s.high95).toBeGreaterThan(s.high68);
      expect(s.median).toBeGreaterThan(s.low68);
      expect(s.median).toBeLessThan(s.high68);
    }
    expect(w(run!.scenarios[4]!)).toBeGreaterThan(w(run!.scenarios[0]!));
  });

  it("puts almost all paths above the start on a steadily rising series", () => {
    const run = runMonteCarlo({
      closes: walk(120, 50, 0.002),
      symbol: "UP",
      asOf: "2026-01-01",
      horizons: [{ id: "21d", days: 21, label: "1 month" }],
    });
    expect(run!.scenarios[0]!.probabilityUp).toBeGreaterThan(0.8);
    expect(run!.scenarios[0]!.expectedReturnPct).toBeGreaterThan(0);
  });
});
