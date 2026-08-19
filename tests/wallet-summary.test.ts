import { describe, expect, it } from "vitest";
import { summarizeWallet, WALLET_GAIN_TAX_RATE } from "@/lib/wallet/summary";

function lot(costValue: number, marketValue: number | null) {
  return { status: { costValue, marketValue } };
}

describe("summarizeWallet", () => {
  it("sums invested cost and applies 15% tax only on profit", () => {
    const summary = summarizeWallet([lot(1000, 1100), lot(500, 480)]);
    expect(summary.invested).toBe(1500);
    expect(summary.quotedCost).toBe(1500);
    expect(summary.gross).toBe(1580);
    expect(summary.profit).toBe(80);
    expect(summary.tax).toBeCloseTo(80 * WALLET_GAIN_TAX_RATE);
    expect(summary.net).toBeCloseTo(1580 - 80 * 0.15);
  });

  it("does not tax a net loss", () => {
    const summary = summarizeWallet([lot(1000, 900)]);
    expect(summary.gross).toBe(900);
    expect(summary.profit).toBe(-100);
    expect(summary.tax).toBe(0);
    expect(summary.net).toBe(900);
  });

  it("keeps invested when quotes are missing", () => {
    const summary = summarizeWallet([lot(200, null)]);
    expect(summary.invested).toBe(200);
    expect(summary.quotedCost).toBe(0);
    expect(summary.gross).toBeNull();
    expect(summary.net).toBeNull();
    expect(summary.incomplete).toBe(true);
  });
});
