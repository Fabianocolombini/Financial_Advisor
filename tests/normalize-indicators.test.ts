import { describe, expect, it } from "vitest";
import {
  mergeIndicatorPools,
  normalizeIndicatorSnapshot,
  resolveIndicatorValue,
} from "@/lib/motor/normalize-indicators";

describe("normalize-indicators", () => {
  it("resolves percentile_cs when value is absent", () => {
    expect(
      resolveIndicatorValue({ id: "trend", name: "Trend", percentile_cs: 0.72 }),
    ).toBe(0.72);
  });

  it("normalizes regime component shape", () => {
    const norm = normalizeIndicatorSnapshot({
      id: "real_yield_low",
      nome: "Real yield low",
      valor: 1.8,
      contribuicao: 0.15,
      is_proxy: true,
      proxy_rationale: "DFII10 proxy",
    });
    expect(norm.id).toBe("real_yield_low");
    expect(norm.value).toBe(1.8);
    expect(norm.isProxy).toBe(true);
    expect(norm.proxyRationale).toBe("DFII10 proxy");
  });

  it("merges pools preferring entries with values", () => {
    const merged = mergeIndicatorPools([
      [{ id: "trend", name: "Trend", value: null }],
      [{ id: "trend", name: "Trend", percentile_cs: 0.55 }],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.value).toBe(0.55);
  });
});
