import { describe, expect, it } from "vitest";
import { emptySymbolFinancials } from "@/lib/market/financials-types";

describe("financials-types", () => {
  it("starts empty without inventing zeros", () => {
    const empty = emptySymbolFinancials("AAPL");
    expect(empty.hasFinancialData).toBe(false);
    expect(empty.hasEarningsData).toBe(false);
    expect(empty.totalRevenue).toBeNull();
    expect(empty.annualStatements).toEqual([]);
  });
});
