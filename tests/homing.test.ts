import { describe, expect, it } from "vitest";
import { buildHomingView } from "@/lib/homing/build-homing";
import { composeHomingEmail } from "@/lib/homing/homing-email";
import type { MotorDashboardSnapshot } from "@/lib/motor/snapshot-types";
import { evaluateWalletPosition } from "@/lib/wallet/position-status";
import type { WalletHoldingView } from "@/lib/wallet/types";

const names = {
  name: (symbol: string) => (symbol === "CLOZ" ? "Panagram AAA CLO ETF" : symbol),
  classLabel: (classId: string) =>
    classId === "cash_equivalents" ? "Cash" : classId,
};

function holding(
  overrides: Partial<WalletHoldingView> & {
    symbol: string;
    statusInput?: Parameters<typeof evaluateWalletPosition>[0];
  },
): WalletHoldingView {
  const status = evaluateWalletPosition(
    overrides.statusInput ?? {
      price: 110,
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
    classId: overrides.classId ?? "us_equity",
    name: overrides.name ?? overrides.symbol,
    exchange: overrides.exchange ?? "NASDAQ",
    kind: overrides.kind ?? "stock",
    quantity: overrides.quantity ?? 10,
    costPrice: overrides.costPrice ?? 100,
    purchasedAt: overrides.purchasedAt ?? "2026-01-01T00:00:00.000Z",
    targetMin: overrides.targetMin ?? 90,
    targetMax: overrides.targetMax ?? 130,
    notes: overrides.notes ?? null,
    last: overrides.last ?? status.last,
    changePercent: overrides.changePercent ?? 2.4,
    currency: overrides.currency ?? "USD",
    status: overrides.status ?? status,
  };
}

function snapshot(tickers: MotorDashboardSnapshot["tickers"]): MotorDashboardSnapshot {
  return {
    asOf: "2026-08-18",
    classes: {
      cash_equivalents: {
        abaId: "cash_equivalents",
        classId: "cash_equivalents",
        label: "Cash",
        data: "2026-08-18",
        score: 0.6,
        stage: "Ascendente",
        stageLabel: "Accumulate",
        entryTiming: "Buy",
        entryValidated: true,
        indicators: [],
      },
    },
    tickers,
  };
}

const clozNow = {
  symbol: "CLOZ",
  abaId: "cash_equivalents",
  classId: "cash_equivalents",
  data: "2026-08-18",
  score: 0.72,
  stage: "Ascendente",
  stageLabel: "Accumulate",
  entryTiming: "Buy",
  entryValidated: true,
  perf1dPct: 0.3,
  indicators: [],
};

const clozPrev = { ...clozNow, score: 0.61, entryTiming: "Wait", entryValidated: false };

describe("buildHomingView", () => {
  it("explains the book vs yesterday and lists Can add names you do not own", () => {
    const view = buildHomingView({
      names,
      holdings: [
        holding({
          symbol: "NVDA",
          changePercent: 2.4,
          last: 110,
        }),
      ],
      current: snapshot({ CLOZ: clozNow, NVDA: { ...clozNow, symbol: "NVDA", classId: "us_equity", score: 0.4, entryTiming: "Avoid" } }),
      previous: snapshot({ CLOZ: clozPrev }),
    });

    expect(view.book.empty).toBe(false);
    expect(view.book.dayPnl).toBeGreaterThan(0);
    expect(view.book.narrative).toContain("NVDA");
    expect(view.book.chart).toHaveLength(2);
    expect(view.approaching.canAddCount).toBe(1);
    expect(view.approaching.rows[0]?.symbol).toBe("CLOZ");
    expect(view.approaching.rows[0]?.scoreDelta).toBeCloseTo(0.11);
    expect(view.approaching.flippedCount).toBe(1);
    expect(view.approaching.narrative).toContain("CLOZ");
  });

  it("still shows approaching a buy when the book is empty", () => {
    const view = buildHomingView({
      names,
      holdings: [],
      current: snapshot({ CLOZ: clozNow }),
      previous: null,
    });
    expect(view.book.empty).toBe(true);
    expect(view.book.narrative).toContain("No names bought yet");
    expect(view.approaching.canAddCount).toBe(1);
    expect(view.hasPreviousSnapshot).toBe(false);
    expect(view.approaching.narrative).toContain("Score change");
  });
});

describe("composeHomingEmail", () => {
  it("prints both chapters and links Homing", () => {
    const view = buildHomingView({
      names,
      holdings: [holding({ symbol: "NVDA" })],
      current: snapshot({ CLOZ: clozNow }),
      previous: snapshot({ CLOZ: clozPrev }),
    });
    const mail = composeHomingEmail({
      view,
      walletUrl: "https://financial-advisor-sable.vercel.app/homing",
    });
    expect(mail.subject).toContain("Homing");
    expect(mail.text).toContain("MY BOOK");
    expect(mail.text).toContain("APPROACHING A BUY");
    expect(mail.text).toContain("CLOZ");
    expect(mail.html).toContain("/homing");
  });
});
