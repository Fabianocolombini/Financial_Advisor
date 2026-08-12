import { describe, expect, it } from "vitest";
import { buildLandingBook } from "@/lib/landing/build-view";
import type { MotorDashboardSnapshot } from "@/lib/motor/snapshot-types";

function snapshot(partial: Partial<MotorDashboardSnapshot>): MotorDashboardSnapshot {
  return {
    asOf: "2026-08-11",
    classes: {},
    tickers: {},
    ...partial,
  };
}

function tick(
  symbol: string,
  classId: string,
  perf1dPct: number,
): MotorDashboardSnapshot["tickers"][string] {
  return {
    symbol,
    abaId: classId,
    classId,
    data: "2026-08-11",
    score: 0.5,
    stage: "Hold",
    stageLabel: "Hold",
    indicators: [],
    perf1dPct,
  };
}

describe("buildLandingBook", () => {
  it("lists Cash first with three featured names and a class total", () => {
    const { classes } = buildLandingBook(
      snapshot({
        tickers: {
          SHV: tick("SHV", "cash_equivalents", 0.02),
          BIL: tick("BIL", "cash_equivalents", 0.04),
          SGOV: tick("SGOV", "cash_equivalents", 0.06),
        },
      }),
    );
    expect(classes[0]?.classId).toBe("cash_equivalents");
    expect(classes[0]?.label).toBe("Cash");
    expect(classes[0]?.featured.map((f) => f.symbol)).toEqual(["SHV", "BIL", "SGOV"]);
    expect(classes[0]?.changePercent).toBeCloseTo(0.04);
  });

  it("pins five names on US Equity and never invents a 1D number", () => {
    const { classes } = buildLandingBook(snapshot({}));
    const us = classes.find((c) => c.classId === "us_equity");
    expect(us?.featured).toHaveLength(5);
    expect(us?.changePercent).toBeNull();
    expect(us?.available).toBe(false);
  });

  it("ranks the tape's top 10 by absolute 1D move", () => {
    const { top10 } = buildLandingBook(
      snapshot({
        tickers: {
          SPY: tick("SPY", "us_equity", 1),
          TLT: tick("TLT", "fi_treasury", -4),
          GLD: tick("GLD", "commodities_precious", 2),
        },
      }),
    );
    expect(top10.map((t) => t.symbol)).toEqual(["TLT", "GLD", "SPY"]);
  });
});
