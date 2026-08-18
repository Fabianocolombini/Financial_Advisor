import { describe, expect, it } from "vitest";
import { composeWalletDigest } from "@/lib/wallet/daily-digest";
import { evaluateWalletPosition } from "@/lib/wallet/position-status";
import type { WalletHoldingView } from "@/lib/wallet/types";

function holding(
  overrides: Partial<WalletHoldingView> & {
    symbol: string;
    statusInput?: Parameters<typeof evaluateWalletPosition>[0];
  },
): WalletHoldingView {
  const status = evaluateWalletPosition(
    overrides.statusInput ?? {
      price: 105,
      costPrice: 100,
      quantity: 10,
      targetMin: 90,
      targetMax: 130,
      allocation: "Hold",
      instrumentQuality: "Competitive",
      entryTiming: "Wait",
    },
  );
  return {
    id: overrides.id ?? overrides.symbol,
    symbol: overrides.symbol,
    classId: overrides.classId ?? "cash_equivalents",
    name: overrides.name ?? overrides.symbol,
    exchange: overrides.exchange ?? "NYSE",
    kind: overrides.kind ?? "etf",
    quantity: overrides.quantity ?? 10,
    costPrice: overrides.costPrice ?? 100,
    purchasedAt: overrides.purchasedAt ?? "2026-01-01T00:00:00.000Z",
    targetMin: overrides.targetMin ?? 90,
    targetMax: overrides.targetMax ?? 130,
    notes: overrides.notes ?? null,
    last: overrides.last ?? status.last,
    changePercent: overrides.changePercent ?? 0.4,
    currency: overrides.currency ?? "USD",
    status: overrides.status ?? status,
  };
}

describe("composeWalletDigest", () => {
  const asOf = new Date("2026-08-17T21:30:00.000Z");

  it("emails Hold, Buy more and Exit for every lot, to the registered address flow", () => {
    const digest = composeWalletDigest({
      asOf,
      walletUrl: "https://financial-advisor-sable.vercel.app/wallet",
      holdings: [
        holding({
          symbol: "SGOV",
          statusInput: {
            price: 100.4,
            costPrice: 100,
            quantity: 20,
            targetMin: 95,
            targetMax: 110,
            allocation: "Hold",
            instrumentQuality: "Competitive",
            entryTiming: "Wait",
          },
        }),
        holding({
          symbol: "NVDA",
          statusInput: {
            price: 102,
            costPrice: 100,
            quantity: 5,
            targetMin: 90,
            targetMax: 130,
            allocation: "Overweight",
            instrumentQuality: "Preferred",
            entryTiming: "Buy",
          },
        }),
        holding({
          symbol: "XLE",
          statusInput: {
            price: 131,
            costPrice: 100,
            quantity: 8,
            targetMin: 90,
            targetMax: 130,
            allocation: "Hold",
            instrumentQuality: "Competitive",
            entryTiming: "Wait",
          },
        }),
      ],
    });

    expect(digest.subject).toBe("Atlas wallet — 1 to buy more, 1 to exit, 1 hold");
    expect(digest.text).toContain("BUY MORE");
    expect(digest.text).toContain("NVDA");
    expect(digest.text).toContain("HOLD");
    expect(digest.text).toContain("SGOV");
    expect(digest.text).toContain("EXIT");
    expect(digest.text).toContain("XLE");
    expect(digest.text).toContain("not regulated investment advice");
    expect(digest.html).toContain("Buy more");
    expect(digest.html).toContain("https://financial-advisor-sable.vercel.app/wallet");
    expect(digest.decisionItems.map((item) => item.symbol)).toEqual(["NVDA", "XLE"]);
  });

  it("still sends a briefing when every lot is Hold", () => {
    const digest = composeWalletDigest({
      asOf,
      walletUrl: "https://example.test/wallet",
      holdings: [
        holding({
          symbol: "SGOV",
          statusInput: {
            price: 100.2,
            costPrice: 100,
            quantity: 10,
            targetMin: 90,
            targetMax: 110,
            allocation: "Hold",
            instrumentQuality: "Competitive",
            entryTiming: "Wait",
          },
        }),
      ],
    });

    expect(digest.subject).toBe("Atlas wallet — all Hold (1 name)");
    expect(digest.decisionItems).toEqual([]);
    expect(digest.text).toContain("HOLD");
    expect(digest.text).toContain("SGOV");
  });
});
