import { describe, expect, it } from "vitest";
import {
  buyProximity,
  compareBuyProximity,
  normalizeAllocationAction,
} from "@/lib/motor/buy-proximity";

const energy = {
  classId: "commodities_energy",
  allocationAction: "Hold",
  instrumentQuality: "Preferred",
  divergesFromClass: false,
};

describe("buyProximity", () => {
  it("uses the bottleneck axis, not the average — MPC-style Hold + Preferred", () => {
    const p = buyProximity({
      ...energy,
      regimeScore: 0.5,
      securityScore: 0.862,
    });
    expect(p.state).toBe("open");
    expect(p.distance).toBeCloseTo(0.15);
    expect(p.blockedBy).toBe("regime");
    expect(p.value).toBe("0.15");
    expect(p.axis).toBe("Class");
    expect(p.hint).toMatch(/class still has to reach Overweight/i);
  });

  it("points at the name when the class is already Overweight", () => {
    const p = buyProximity({
      classId: "us_equity",
      regimeScore: 0.72,
      securityScore: 0.57,
      allocationAction: "Overweight",
      instrumentQuality: "Competitive",
    });
    expect(p.state).toBe("open");
    expect(p.distance).toBeCloseTo(0.08);
    expect(p.blockedBy).toBe("quality");
    expect(p.axis).toBe("Name");
  });

  it("is ready only when both gates are open", () => {
    const p = buyProximity({
      classId: "us_equity",
      regimeScore: 0.7,
      securityScore: 0.68,
      allocationAction: "Overweight",
      instrumentQuality: "Preferred",
    });
    expect(p.state).toBe("ready");
    expect(p.distance).toBe(0);
    expect(p.blockedBy).toBeNull();
    expect(p.axis).toBe("Can add");
  });

  it("blocks Reduce without showing a near-Buy number", () => {
    const p = buyProximity({
      classId: "commodities_precious",
      regimeScore: 0.55,
      securityScore: 0.84,
      allocationAction: "Reduce",
      instrumentQuality: "Preferred",
      divergesFromClass: false,
    });
    expect(p.state).toBe("blocked");
    expect(p.distance).toBeNull();
    expect(p.value).toBe("Blocked");
    expect(p.axis).toBe("Reduce");
  });

  it("treats Reduce + diverge + Preferred as Watch, not a distance", () => {
    const p = buyProximity({
      classId: "alt_bdc",
      regimeScore: 0.3,
      securityScore: 0.8,
      allocationAction: "Reduce",
      instrumentQuality: "Preferred",
      divergesFromClass: true,
    });
    expect(p.state).toBe("watch");
    expect(p.distance).toBeNull();
    expect(p.value).toBe("Watch");
    expect(p.axis).toBe("Diverges");
  });

  it("blocks Weak even if the class is Overweight", () => {
    const p = buyProximity({
      classId: "us_equity",
      regimeScore: 0.8,
      securityScore: 0.2,
      allocationAction: "Overweight",
      instrumentQuality: "Weak",
    });
    expect(p.state).toBe("blocked");
    expect(p.axis).toBe("Weak");
    expect(p.distance).toBeNull();
  });

  it("ignores name quality for cash distance (regime only)", () => {
    const hold = buyProximity({
      classId: "cash_equivalents",
      regimeScore: 0.5,
      securityScore: 0.9,
      allocationAction: "Hold",
      instrumentQuality: "Preferred",
    });
    expect(hold.state).toBe("open");
    expect(hold.distance).toBeCloseTo(0.15);
    expect(hold.blockedBy).toBe("regime");
    expect(hold.qualityGap).toBe(0);

    const ready = buyProximity({
      classId: "cash_equivalents",
      regimeScore: 0.7,
      securityScore: 0.4,
      allocationAction: "Overweight",
      instrumentQuality: "Competitive",
    });
    expect(ready.state).toBe("ready");
    expect(ready.distance).toBe(0);
  });

  it("still blocks Weak cash before the regime-only formula", () => {
    const p = buyProximity({
      classId: "cash_equivalents",
      regimeScore: 0.8,
      securityScore: 0.1,
      allocationAction: "Overweight",
      instrumentQuality: "Weak",
    });
    expect(p.state).toBe("blocked");
    expect(p.axis).toBe("Weak");
  });

  it("sorts ready, then closest open, then watch, then blocked", () => {
    const ready = buyProximity({
      classId: "us_equity",
      regimeScore: 0.7,
      securityScore: 0.7,
      allocationAction: "Overweight",
      instrumentQuality: "Preferred",
    });
    const close = buyProximity({
      ...energy,
      regimeScore: 0.5,
      securityScore: 0.862,
    });
    const farther = buyProximity({
      ...energy,
      regimeScore: 0.5,
      securityScore: 0.4,
    });
    const blocked = buyProximity({
      classId: "commodities_precious",
      regimeScore: 0.2,
      securityScore: 0.8,
      allocationAction: "Reduce",
      instrumentQuality: "Preferred",
    });
    const ranked = [blocked, farther, ready, close].sort((a, b) =>
      compareBuyProximity(a, b),
    );
    expect(ranked.map((p) => p.state)).toEqual(["ready", "open", "open", "blocked"]);
    expect(ranked[1]?.distance).toBeLessThan(ranked[2]?.distance ?? 99);
  });
});

describe("normalizeAllocationAction", () => {
  it("maps UI Increase / Accumulate onto Overweight", () => {
    expect(normalizeAllocationAction("Increase")).toBe("Overweight");
    expect(normalizeAllocationAction("Accumulate")).toBe("Overweight");
    expect(normalizeAllocationAction("Strong Reduce")).toBe("Strong Reduce");
  });
});
