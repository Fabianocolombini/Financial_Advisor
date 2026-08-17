import { describe, expect, it } from "vitest";
import { entrySetup, sleeveRiskFromStage } from "@/lib/motor/entry-setup";

describe("sleeveRiskFromStage", () => {
  it("maps the class climate onto 0–100", () => {
    expect(sleeveRiskFromStage("Accumulate")).toBe(18);
    expect(sleeveRiskFromStage("Hold")).toBe(42);
    expect(sleeveRiskFromStage("Reduce")).toBe(72);
    expect(sleeveRiskFromStage("Strong Reduce")).toBe(90);
    expect(sleeveRiskFromStage("ForteDescendente")).toBe(90);
  });
});

describe("entrySetup", () => {
  const base = {
    entryValidated: false,
    hasMotorData: true,
    motorScope: "ticker" as const,
  };

  it("keeps Do not add when the class is reducing, even if the name is mid-pack", () => {
    const setup = entrySetup({
      ...base,
      score: 0.563,
      classStageLabel: "Strong Reduce",
      entryTiming: "Avoid",
    });
    expect(setup.label).toBe("Do not add");
    expect(setup.gain).toBe(56);
    expect(setup.risk).toBeGreaterThan(setup.gain!);
    expect(setup.hint).toMatch(/fight a class that is reducing/i);
  });

  it("shows a high Gain and a low Risk when the sleeve is overweight and the name leads", () => {
    const setup = entrySetup({
      ...base,
      score: 0.8,
      classStageLabel: "Accumulate",
      entryTiming: "Buy",
      entryValidated: true,
    });
    expect(setup.label).toBe("Can add");
    expect(setup.gain).toBe(80);
    expect(setup.risk).toBeLessThan(setup.gain!);
  });

  it("does not invent a buy window for cash Neutral", () => {
    const setup = entrySetup({
      ...base,
      score: 0.56,
      classStageLabel: "Hold",
      entryTiming: "Neutral",
    });
    expect(setup.label).toBe("Indifferent");
    expect(setup.hint).toMatch(/no good or bad entry/i);
  });
});
