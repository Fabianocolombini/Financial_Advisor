import { describe, expect, it } from "vitest";
import {
  buildPivotTable,
  computePivotSet,
  PIVOT_LEVEL_ORDER,
  pivotTargets,
  previousPeriodOhlc,
  type PivotSourceBar,
} from "@/lib/market/pivot-points";

const OHLC = { open: 100, high: 110, low: 90, close: 105, from: "2024-01-01", to: "2024-01-01" };

function bar(date: string, o: number, h: number, l: number, c: number): PivotSourceBar {
  return { date, value: c, open: o, high: h, low: l };
}

describe("pivot formulas", () => {
  it("computes classic pivots from the period range", () => {
    const { levels } = computePivotSet("classic", OHLC);
    // P = (110 + 90 + 105) / 3
    expect(levels.P).toBeCloseTo(101.6667, 3);
    expect(levels.R1).toBeCloseTo(113.3333, 3); // 2P - low
    expect(levels.S1).toBeCloseTo(93.3333, 3); // 2P - high
    expect(levels.R2).toBeCloseTo(121.6667, 3); // P + range
    expect(levels.S2).toBeCloseTo(81.6667, 3);
  });

  it("places fibonacci bands at 38.2, 61.8 and 100 percent of the range", () => {
    const { levels } = computePivotSet("fibonacci", OHLC);
    const p = levels.P!;
    expect(levels.R1! - p).toBeCloseTo(0.382 * 20, 6);
    expect(levels.R2! - p).toBeCloseTo(0.618 * 20, 6);
    expect(levels.R3! - p).toBeCloseTo(20, 6);
    expect(p - levels.S1!).toBeCloseTo(0.382 * 20, 6);
  });

  it("keeps camarilla bands tighter than classic ones", () => {
    const camarilla = computePivotSet("camarilla", OHLC).levels;
    const classic = computePivotSet("classic", OHLC).levels;
    expect(camarilla.R3! - camarilla.S3!).toBeLessThan(classic.R3! - classic.S3!);
  });

  it("weights the close twice in the woodie pivot", () => {
    const { levels } = computePivotSet("woodie", OHLC);
    expect(levels.P).toBeCloseTo((110 + 90 + 2 * 105) / 4, 6);
  });

  it("switches the demark base on the sign of the period candle", () => {
    const up = computePivotSet("demark", { ...OHLC, open: 100, close: 105 }).levels;
    const down = computePivotSet("demark", { ...OHLC, open: 105, close: 100 }).levels;
    expect(up.P).not.toBeCloseTo(down.P!, 6);
    // A stronger close projects a higher pivot.
    expect(up.P!).toBeGreaterThan(down.P!);
  });

  it("leaves the outer demark levels undefined rather than inventing them", () => {
    const { levels } = computePivotSet("demark", OHLC);
    expect(levels.R1).not.toBeNull();
    expect(levels.S1).not.toBeNull();
    expect(levels.R2).toBeNull();
    expect(levels.R3).toBeNull();
    expect(levels.S2).toBeNull();
    expect(levels.S3).toBeNull();
  });

  it("orders each band outward from the first level", () => {
    for (const method of ["classic", "fibonacci", "camarilla", "woodie"] as const) {
      const { levels } = computePivotSet(method, OHLC);
      expect(levels.R3!).toBeGreaterThan(levels.R2!);
      expect(levels.R2!).toBeGreaterThan(levels.R1!);
      expect(levels.S1!).toBeGreaterThan(levels.S2!);
      expect(levels.S2!).toBeGreaterThan(levels.S3!);
    }
  });

  it("brackets the pivot only for the pivot-centred methods", () => {
    // Camarilla is deliberately excluded: its bands are measured from the close,
    // so in a period that closed well above its pivot even S1 sits above P.
    for (const method of ["classic", "fibonacci", "woodie"] as const) {
      const { levels } = computePivotSet(method, OHLC);
      const values = PIVOT_LEVEL_ORDER.map((l) => levels[l]).filter(
        (v): v is number => v != null,
      );
      expect(values).toEqual([...values].sort((a, b) => b - a));
    }
    const camarilla = computePivotSet("camarilla", OHLC).levels;
    expect(camarilla.S1!).toBeGreaterThan(camarilla.P!);
  });
});

describe("period selection", () => {
  const bars = [
    bar("2024-01-01", 10, 12, 9, 11),
    bar("2024-01-02", 11, 14, 10, 13),
    bar("2024-01-03", 13, 15, 12, 14),
  ];

  it("uses the previous session, never the one in progress", () => {
    const ohlc = previousPeriodOhlc(bars, "daily")!;
    expect(ohlc.to).toBe("2024-01-02");
    expect(ohlc.high).toBe(14);
    expect(ohlc.close).toBe(13);
  });

  it("aggregates the previous calendar month", () => {
    const monthly = [
      bar("2024-01-10", 10, 20, 5, 15),
      bar("2024-01-25", 15, 22, 8, 18),
      bar("2024-02-02", 18, 19, 17, 18),
    ];
    const ohlc = previousPeriodOhlc(monthly, "monthly")!;
    expect(ohlc.high).toBe(22);
    expect(ohlc.low).toBe(5);
    expect(ohlc.open).toBe(10);
    expect(ohlc.close).toBe(18);
  });

  it("groups sessions of the same ISO week together", () => {
    const weekly = [
      // Mon 2024-01-08 .. Wed 2024-01-10, then the following Monday.
      bar("2024-01-08", 10, 16, 9, 12),
      bar("2024-01-09", 12, 18, 11, 15),
      bar("2024-01-10", 15, 17, 14, 16),
      bar("2024-01-15", 16, 17, 15, 16),
    ];
    const ohlc = previousPeriodOhlc(weekly, "weekly")!;
    expect(ohlc.from).toBe("2024-01-08");
    expect(ohlc.to).toBe("2024-01-10");
    expect(ohlc.high).toBe(18);
  });

  it("returns nothing when there is only one period of history", () => {
    expect(previousPeriodOhlc([bar("2024-01-01", 1, 2, 1, 2)], "daily")).toBeNull();
    expect(buildPivotTable([bar("2024-01-01", 1, 2, 1, 2)], "daily")).toBeNull();
  });

  it("falls back to the close when a feed omits the intraday range", () => {
    const closeOnly: PivotSourceBar[] = [
      { date: "2024-01-01", value: 10 },
      { date: "2024-01-02", value: 12 },
    ];
    const ohlc = previousPeriodOhlc(closeOnly, "daily")!;
    expect(ohlc.high).toBe(10);
    expect(ohlc.low).toBe(10);
  });
});

describe("pivot targets", () => {
  const bars = [
    bar("2024-01-01", 100, 110, 90, 105),
    bar("2024-01-02", 105, 106, 104, 105),
  ];

  it("picks the nearest level above and below the current price", () => {
    const table = buildPivotTable(bars, "daily")!;
    const { resistance, support } = pivotTargets(table, 101.6);
    expect(resistance).not.toBeNull();
    expect(support).not.toBeNull();
    expect(resistance!.price).toBeGreaterThan(101.6);
    expect(support!.price).toBeLessThan(101.6);
    expect(resistance!.distancePct).toBeGreaterThan(0);
    expect(support!.distancePct).toBeLessThan(0);
  });

  it("reports no resistance when price is above every projected level", () => {
    const table = buildPivotTable(bars, "daily")!;
    const { resistance, support } = pivotTargets(table, 10_000);
    expect(resistance).toBeNull();
    expect(support).not.toBeNull();
  });
});
