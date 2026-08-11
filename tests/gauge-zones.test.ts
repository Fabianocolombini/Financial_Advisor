import { describe, expect, it } from "vitest";
import {
  clampGaugeValue,
  gaugeNeedleDegrees,
  gaugeZoneForValue,
} from "@/lib/motor/gauge-zones";

describe("gauge-zones", () => {
  it("clamps out-of-range values", () => {
    expect(clampGaugeValue(2)).toBe(1);
    expect(clampGaugeValue(-3)).toBe(-1);
    expect(clampGaugeValue(NaN)).toBe(0);
  });

  it("maps value to TradingView-style zones", () => {
    expect(gaugeZoneForValue(-0.8)).toBe("Strong Sell");
    expect(gaugeZoneForValue(-0.3)).toBe("Sell");
    expect(gaugeZoneForValue(0)).toBe("Neutral");
    expect(gaugeZoneForValue(0.25)).toBe("Buy");
    expect(gaugeZoneForValue(0.9)).toBe("Strong Buy");
  });

  it("maps needle degrees linearly", () => {
    expect(gaugeNeedleDegrees(-1)).toBe(-90);
    expect(gaugeNeedleDegrees(0)).toBe(0);
    expect(gaugeNeedleDegrees(1)).toBe(90);
  });
});
