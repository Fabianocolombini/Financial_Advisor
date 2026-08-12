import { describe, expect, it } from "vitest";
import { buildLandingGroups } from "@/lib/landing/build-view";
import type { MotorDashboardSnapshot } from "@/lib/motor/snapshot-types";

function snapshot(partial: Partial<MotorDashboardSnapshot>): MotorDashboardSnapshot {
  return {
    asOf: "2026-08-11",
    classes: {},
    tickers: {},
    ...partial,
  };
}

describe("buildLandingGroups", () => {
  it("marks a group unavailable when the snapshot has nothing for it", () => {
    const { groups } = buildLandingGroups(snapshot({}));
    const realAssets = groups.find((g) => g.id === "real_assets");
    expect(realAssets?.available).toBe(false);
    expect(realAssets?.changePercent).toBeNull();
  });

  it("averages 1D ticker moves and never invents a number", () => {
    const { groups, movers } = buildLandingGroups(
      snapshot({
        tickers: {
          SPY: {
            symbol: "SPY",
            abaId: "us_equity",
            classId: "us_equity",
            data: "2026-08-11",
            score: 0.6,
            stage: "Hold",
            stageLabel: "Hold",
            indicators: [],
            perf1dPct: 1.0,
          },
          EFA: {
            symbol: "EFA",
            abaId: "intl_equity",
            classId: "intl_equity",
            data: "2026-08-11",
            score: 0.5,
            stage: "Hold",
            stageLabel: "Hold",
            indicators: [],
            perf1dPct: 3.0,
          },
        },
      }),
    );
    const equities = groups.find((g) => g.id === "equities");
    expect(equities?.available).toBe(true);
    expect(equities?.changePercent).toBe(2);
    expect(movers[0]?.id).toBe("equities");
  });

  it("surfaces Hold/Reduce from class allocation without mixing in missing classes", () => {
    const { groups } = buildLandingGroups(
      snapshot({
        classes: {
          commodities_energy: {
            abaId: "commodities_energy",
            classId: "commodities_energy",
            label: "Energy",
            data: "2026-08-11",
            score: 0.4,
            stage: "Reduce",
            stageLabel: "Reduce",
            allocationAction: "Reduce",
            indicators: [],
            scoreHistory: [
              { date: "2026-08-01", score: 0.5 },
              { date: "2026-08-11", score: 0.4 },
            ],
          },
        },
      }),
    );
    const commodities = groups.find((g) => g.id === "commodities");
    expect(commodities?.regimeLabel).toBe("Reduce");
    expect(commodities?.sparkline).toEqual([0.5, 0.4]);
    expect(commodities?.available).toBe(true);
  });
});
