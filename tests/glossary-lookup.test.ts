import { describe, expect, it } from "vitest";
import {
  getGlossaryEntry,
  glossaryTermForIndicator,
} from "@/lib/motor/glossary-lookup";

describe("glossary-lookup", () => {
  it("maps technical ids to existing terms", () => {
    expect(glossaryTermForIndicator("rsi_14")).toBe("rsi");
    expect(glossaryTermForIndicator("sma_50")).toBe("moving_averages");
    expect(glossaryTermForIndicator("ema_200")).toBe("moving_averages");
  });

  it("resolves motor indicators with meaning and how to read", () => {
    const cashVol = getGlossaryEntry("vol_realizada");
    expect(cashVol && typeof cashVol === "object" && "read" in cashVol).toBe(true);

    const z = getGlossaryEntry("preco_vs_mm50_z_abs");
    expect(z && typeof z === "object" && "meaning" in z).toBe(true);

    expect(glossaryTermForIndicator("real_yield_10y")).toBe("yield_real_10y");
    expect(glossaryTermForIndicator("loan_officer")).toBe("sloos");
    expect(getGlossaryEntry("yield_real_caixa")).not.toBeNull();
  });

  it("returns null for unknown ids", () => {
    expect(glossaryTermForIndicator("not_a_real_indicator")).toBeNull();
    expect(getGlossaryEntry("not_a_real_indicator")).toBeNull();
  });
});
