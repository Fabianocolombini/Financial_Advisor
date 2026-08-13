import { describe, expect, it } from "vitest";
import {
  buildLandingBook,
  isEntryOpportunity,
  rankMovers,
} from "@/lib/landing/build-view";
import type {
  MotorClassSnapshot,
  MotorDashboardSnapshot,
} from "@/lib/motor/snapshot-types";

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
  extra?: Partial<MotorDashboardSnapshot["tickers"][string]>,
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
    ...extra,
  };
}

function klass(
  classId: string,
  extra?: Partial<MotorClassSnapshot>,
): MotorClassSnapshot {
  return {
    abaId: classId,
    classId,
    label: classId,
    data: "2026-08-11",
    score: 0.5,
    stage: "Hold",
    stageLabel: "Hold",
    indicators: [],
    ...extra,
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
    expect(classes[0]?.chartSymbol).toBe("SHV");
    expect(classes[0]?.featured.map((f) => f.symbol)).toEqual(["SHV", "BIL", "SGOV"]);
    expect(classes[0]?.changePercent).toBeCloseTo(0.04);
    expect(classes[0]?.shareOfMixPct).toBeCloseTo(100 / 17);
    expect(classes[0]?.featured.map((f) => f.shareOfGroupPct)).toEqual([
      expect.closeTo(100 / 3),
      expect.closeTo(100 / 3),
      expect.closeTo(100 / 3),
    ]);
  });

  it("pins five names on US Equity and never invents a 1D number", () => {
    const { classes } = buildLandingBook(snapshot({}));
    const us = classes.find((c) => c.classId === "us_equity");
    expect(us?.featured).toHaveLength(5);
    expect(us?.chartSymbol).toBe("SPY");
    expect(us?.changePercent).toBeNull();
    expect(us?.available).toBe(false);
  });

  it("gives Overweight Treasuries a larger mix share than Hold Cash", () => {
    const { classes } = buildLandingBook(
      snapshot({
        classes: {
          fi_treasury: klass("fi_treasury", { allocationAction: "Overweight" }),
          cash_equivalents: klass("cash_equivalents", { allocationAction: "Hold" }),
        },
      }),
    );
    const treasuries = classes.find((c) => c.classId === "fi_treasury");
    const cash = classes.find((c) => c.classId === "cash_equivalents");
    expect(treasuries?.shareOfMixPct).toBeCloseTo((1.5 / 17.5) * 100);
    expect(cash?.shareOfMixPct).toBeCloseTo((1 / 17.5) * 100);
    expect(classes.reduce((s, c) => s + (c.shareOfMixPct ?? 0), 0)).toBeCloseTo(100);
  });

  it("splits the group by motor score so TLT outweighs GOVT", () => {
    const { classes } = buildLandingBook(
      snapshot({
        tickers: {
          TLT: tick("TLT", "fi_treasury", 0.1, { score: 0.9 }),
          IEF: tick("IEF", "fi_treasury", 0.1, { score: 0.6 }),
          GOVT: tick("GOVT", "fi_treasury", 0.1, { score: 0.3 }),
        },
      }),
    );
    const treasuries = classes.find((c) => c.classId === "fi_treasury");
    const bySym = Object.fromEntries(
      (treasuries?.featured ?? []).map((f) => [f.symbol, f.shareOfGroupPct]),
    );
    expect(bySym.TLT).toBeCloseTo(50);
    expect(bySym.IEF).toBeCloseTo((0.6 / 1.8) * 100);
    expect(bySym.GOVT).toBeCloseTo((0.3 / 1.8) * 100);
  });

  it("marks a Buy ticker as an entry opportunity", () => {
    const { classes } = buildLandingBook(
      snapshot({
        classes: {
          fi_treasury: klass("fi_treasury", {
            allocationAction: "Overweight",
            entryTiming: "Buy",
            entryValidated: true,
            stageLabel: "Accumulate",
          }),
        },
        tickers: {
          TLT: tick("TLT", "fi_treasury", 0.1, {
            entryTiming: "Buy",
            entryValidated: true,
            stageLabel: "Accumulate",
          }),
          IEF: tick("IEF", "fi_treasury", 0.1, { entryTiming: "Wait" }),
        },
      }),
    );
    const treasuries = classes.find((c) => c.classId === "fi_treasury");
    expect(treasuries?.entryOpportunity).toBe(true);
    expect(treasuries?.featured.find((f) => f.symbol === "TLT")?.entryOpportunity).toBe(
      true,
    );
    expect(treasuries?.featured.find((f) => f.symbol === "IEF")?.entryOpportunity).toBe(
      false,
    );
  });

  it("ranks movers by absolute 5D when asked", () => {
    const { tape } = buildLandingBook(
      snapshot({
        tickers: {
          SPY: { ...tick("SPY", "us_equity", 1), perf7dPct: 0.5 },
          TLT: { ...tick("TLT", "fi_treasury", -0.2), perf7dPct: -8 },
          GLD: { ...tick("GLD", "commodities_precious", 2), perf7dPct: 1 },
        },
      }),
    );
    expect(rankMovers(tape, "5d").map((t) => t.symbol)).toEqual(["TLT", "GLD", "SPY"]);
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

describe("isEntryOpportunity", () => {
  it("treats Buy as an entry and Wait as not", () => {
    expect(isEntryOpportunity({ entryTiming: "Buy" })).toBe(true);
    expect(isEntryOpportunity({ entryTiming: "Wait", entryValidated: true })).toBe(
      false,
    );
  });
});
