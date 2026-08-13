import { describe, expect, it } from "vitest";
import {
  plainNewMoney,
  plainQuality,
  plainTrend,
} from "@/lib/motor/plain-language";

describe("plainTrend", () => {
  it("maps every stage the motor can emit, in English or Portuguese", () => {
    expect(plainTrend("Accumulate").label).toBe("Increase");
    expect(plainTrend("Ascendente").label).toBe("Increase");
    expect(plainTrend("Hold").label).toBe("Hold");
    expect(plainTrend("Maduro").label).toBe("Hold");
    expect(plainTrend("Reduce").label).toBe("Reduce");
    expect(plainTrend("Descendente").label).toBe("Reduce");
    expect(plainTrend("Strong Reduce").label).toBe("Reduce hard");
    expect(plainTrend("ForteDescendente").label).toBe("Reduce hard");
  });

  it("falls back to an explicit no-data label instead of a wrong verdict", () => {
    expect(plainTrend("Analyzing").tone).toBe("unknown");
    expect(plainTrend(null).tone).toBe("unknown");
  });

  it("says Reduce is about direction, not past losses", () => {
    expect(plainTrend("Reduce").hint).toContain("not a realized loss");
  });
});

describe("plainNewMoney", () => {
  const base = { entryValidated: true, hasMotorData: true } as const;

  it("prefers entryTiming over the legacy boolean", () => {
    expect(plainNewMoney({ ...base, entryTiming: "Avoid" }).label).toBe(
      "Do not add",
    );
    expect(plainNewMoney({ ...base, entryTiming: "Buy" }).label).toBe(
      "Can add",
    );
    expect(plainNewMoney({ ...base, entryTiming: "Wait" }).label).toBe("Wait");
  });

  it("treats cash as timing-free rather than as a buy signal", () => {
    const cash = plainNewMoney({ ...base, entryTiming: "Neutral" });
    expect(cash.label).toBe("Indifferent");
    expect(cash.tone).toBe("neutral");
  });

  it("falls back to the boolean on older snapshots", () => {
    expect(plainNewMoney({ ...base, entryTiming: null }).label).toBe(
      "Can add",
    );
    expect(
      plainNewMoney({ entryValidated: false, hasMotorData: true }).label,
    ).toBe("Do not add");
  });

  it("flags class-scope rows as evaluated by the class, not the instrument", () => {
    const row = plainNewMoney({
      entryValidated: true,
      hasMotorData: true,
      motorScope: "class",
    });
    expect(row.hint).toContain("class level");
  });

  it("never claims a verdict without motor data", () => {
    expect(
      plainNewMoney({ entryValidated: true, hasMotorData: false }).label,
    ).toBe("No data");
  });

  it("never promises a return", () => {
    for (const timing of ["Buy", "Wait", "Avoid", "Neutral"]) {
      expect(plainNewMoney({ ...base, entryTiming: timing }).hint).not.toMatch(
        /will (rise|yield)/i,
      );
    }
  });
});

describe("plainQuality", () => {
  it("names the band the motor assigned", () => {
    expect(plainQuality({ instrumentQuality: "Preferred", score: 0.8 }).label).toBe(
      "Among the best",
    );
    expect(plainQuality({ instrumentQuality: "Weak", score: 0.1 }).label).toBe(
      "Among the weakest",
    );
  });

  it("derives a band from the score when the snapshot predates the field", () => {
    expect(plainQuality({ score: 0.62 }).label).toBe("Above median");
    expect(plainQuality({ score: 0.31 }).label).toBe("Below median");
    expect(plainQuality({ score: null }).label).toBe("—");
  });
});
