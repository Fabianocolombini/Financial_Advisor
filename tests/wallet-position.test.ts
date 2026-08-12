import { describe, expect, it } from "vitest";
import {
  actionNeedsAlert,
  evaluateWalletPosition,
  walletBand,
  walletPnl,
} from "@/lib/wallet/position-status";

describe("walletPnl", () => {
  it("computes gain from quantity, cost and last price", () => {
    const pnl = walletPnl(110, 100, 10);
    expect(pnl.costValue).toBe(1000);
    expect(pnl.marketValue).toBe(1100);
    expect(pnl.pnlAbs).toBe(100);
    expect(pnl.pnlPct).toBeCloseTo(10);
    expect(pnl.vsCostPct).toBeCloseTo(10);
  });

  it("stays silent when the quote is missing", () => {
    const pnl = walletPnl(null, 100, 10);
    expect(pnl.marketValue).toBeNull();
    expect(pnl.pnlAbs).toBeNull();
  });
});

describe("walletBand", () => {
  it("uses the user's min/max when they exist", () => {
    const band = walletBand(105, 100, 90, 120);
    expect(band.low).toBe(90);
    expect(band.high).toBe(120);
    expect(band.fraction).toBeCloseTo(0.5);
    expect(band.hitMin).toBe(false);
    expect(band.hitMax).toBe(false);
  });

  it("falls back to ±15% of cost only for the drawing, not as a trigger", () => {
    const band = walletBand(100, 100, null, null);
    expect(band.low).toBeCloseTo(85);
    expect(band.high).toBeCloseTo(115);
    expect(band.hasUserBands).toBe(false);
    expect(band.hitMin).toBe(false);
    expect(band.hitMax).toBe(false);
  });

  it("flags a floor or ceiling hit", () => {
    expect(walletBand(89, 100, 90, 120).hitMin).toBe(true);
    expect(walletBand(121, 100, 90, 120).hitMax).toBe(true);
  });
});

describe("evaluateWalletPosition", () => {
  const base = {
    price: 105,
    costPrice: 100,
    quantity: 10,
    targetMin: 90,
    targetMax: 130,
    allocation: "Hold",
    instrumentQuality: "Competitive",
    entryTiming: "Wait",
  };

  it("says Manter when the lot is inside the plan", () => {
    expect(evaluateWalletPosition(base).action.action).toBe("stay");
  });

  it("says Sair when the price hits the user's ceiling", () => {
    expect(evaluateWalletPosition({ ...base, price: 131 }).action.action).toBe(
      "leave",
    );
  });

  it("says Sair when the price hits the user's floor", () => {
    expect(evaluateWalletPosition({ ...base, price: 89 }).action.action).toBe(
      "leave",
    );
  });

  it("says tendência de queda when the class is in Strong Reduce", () => {
    expect(
      evaluateWalletPosition({ ...base, allocation: "Strong Reduce" }).action
        .action,
    ).toBe("falling");
  });

  it("says Comprar mais when the class is overweight and the paper is not extended", () => {
    expect(
      evaluateWalletPosition({
        ...base,
        allocation: "Overweight",
        instrumentQuality: "Preferred",
        entryTiming: "Buy",
        price: 102,
      }).action.action,
    ).toBe("add");
  });

  it("does not alert on Manter", () => {
    expect(actionNeedsAlert("stay")).toBe(false);
    expect(actionNeedsAlert("leave")).toBe(true);
  });
});
