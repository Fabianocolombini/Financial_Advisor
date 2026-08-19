import { describe, expect, it } from "vitest";
import {
  buildHomingView,
  reconstructBookHistory,
} from "@/lib/homing/build-homing";
import { composeHomingEmail } from "@/lib/homing/homing-email";
import type { MotorDashboardSnapshot } from "@/lib/motor/snapshot-types";
import { evaluateWalletPosition } from "@/lib/wallet/position-status";
import type { WalletHoldingView } from "@/lib/wallet/types";

const names = {
  name: (symbol: string) => (symbol === "CLOZ" ? "Panagram AAA CLO ETF" : symbol),
  classLabel: (classId: string) => {
    if (classId === "cash_equivalents") return "Cash";
    if (classId === "credit") return "Credit";
    if (classId === "precious_metals") return "Precious metals";
    if (classId === "commodities_energy") return "Energy";
    return classId;
  },
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
      credit: {
        abaId: "credit",
        classId: "credit",
        label: "Credit",
        data: "2026-08-18",
        score: 0.55,
        stage: "Maduro",
        stageLabel: "Hold",
        entryTiming: "Wait",
        entryValidated: false,
        indicators: [],
      },
      commodities_energy: {
        abaId: "commodities_energy",
        classId: "commodities_energy",
        label: "Energy",
        data: "2026-08-18",
        score: 0.5,
        allocationScore: 0.5,
        allocationAction: "Hold",
        stage: "Maduro",
        stageLabel: "Hold",
        entryTiming: "Wait",
        entryValidated: false,
        indicators: [],
      },
      precious_metals: {
        abaId: "precious_metals",
        classId: "precious_metals",
        label: "Precious metals",
        data: "2026-08-18",
        score: 0.4,
        stage: "Descendente",
        stageLabel: "Reduce",
        entryTiming: "Avoid",
        entryValidated: false,
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
  perf7dPct: 0.8,
  indicators: [],
};

const clozPrev = { ...clozNow, score: 0.61, entryTiming: "Wait", entryValidated: false };

const vcltNow = {
  symbol: "VCLT",
  abaId: "credit",
  classId: "credit",
  data: "2026-08-18",
  score: 0.58,
  stage: "Maduro",
  stageLabel: "Hold",
  entryTiming: "Wait",
  entryValidated: false,
  perf1dPct: 1.19,
  perf7dPct: 4.0,
  indicators: [],
};

const nemNow = {
  symbol: "NEM",
  abaId: "precious_metals",
  classId: "precious_metals",
  data: "2026-08-18",
  score: 0.42,
  stage: "Descendente",
  stageLabel: "Reduce",
  entryTiming: "Avoid",
  entryValidated: false,
  perf1dPct: 7.7,
  perf7dPct: 9.1,
  indicators: [],
};

describe("reconstructBookHistory", () => {
  it("rebuilds the book session by session from purchase date", () => {
    const points = reconstructBookHistory(
      [
        {
          symbol: "NVDA",
          quantity: 10,
          purchasedAt: "2026-08-10T00:00:00.000Z",
          last: 110,
        },
      ],
      {
        NVDA: [
          { date: "2026-08-09", value: 90 },
          { date: "2026-08-10", value: 100 },
          { date: "2026-08-11", value: 105 },
          { date: "2026-08-12", value: 110 },
        ],
      },
    );
    expect(points.map((p) => p.value)).toEqual([1000, 1050, 1100]);
  });
});

describe("buildHomingView", () => {
  it("splits cost, worth now, vs cost, and vs yesterday", () => {
    const view = buildHomingView({
      names,
      holdings: [
        holding({
          symbol: "NVDA",
          changePercent: 2.4,
          last: 110,
        }),
      ],
      current: snapshot({
        CLOZ: clozNow,
        NVDA: { ...clozNow, symbol: "NVDA", classId: "us_equity", score: 0.4, entryTiming: "Avoid" },
      }),
      previous: snapshot({ CLOZ: clozPrev }),
    });

    expect(view.book.empty).toBe(false);
    expect(view.book.invested).toBe(1000);
    expect(view.book.gross).toBe(1100);
    expect(view.book.vsCostAbs).toBe(100);
    expect(view.book.dayPnl).toBeGreaterThan(0);
    expect(view.book.narrative).toContain("NVDA");
    expect(view.book.lots[0]?.costValue).toBe(1000);
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

  it("lists Wait and a big 1D even when Money is not Can add", () => {
    const view = buildHomingView({
      names,
      holdings: [holding({ symbol: "NVDA" })],
      current: snapshot({
        VCLT: vcltNow,
        NEM: nemNow,
      }),
      previous: null,
    });
    expect(view.approaching.canAddCount).toBe(0);
    expect(view.approaching.waitCount).toBe(1);
    const symbols = view.approaching.rows.map((row) => row.symbol);
    expect(symbols).toContain("VCLT");
    expect(symbols).toContain("NEM");
    expect(view.approaching.rows.find((row) => row.symbol === "VCLT")?.moneyLabel).toBe(
      "Wait",
    );
    expect(view.approaching.rows.find((row) => row.symbol === "NEM")?.moneyLabel).toBe(
      "Do not add",
    );
    expect(view.approaching.narrative).toMatch(/Wait/i);
    expect(view.approaching.narrative).toMatch(/NEM/);
    expect(view.approaching.narrative).toMatch(/price, not an entry/i);
  });

  it("orders Approaching a buy by To buy distance, not Score Δ", () => {
    const view = buildHomingView({
      names,
      holdings: [],
      current: snapshot({
        MPC: {
          symbol: "MPC",
          abaId: "commodities_energy",
          classId: "commodities_energy",
          data: "2026-08-18",
          score: 0.862,
          instrumentQuality: "Preferred",
          stage: "Ascendente",
          stageLabel: "Accumulate",
          entryTiming: "Wait",
          entryValidated: false,
          perf1dPct: 0.4,
          perf7dPct: 1.1,
          indicators: [],
        },
        PSX: {
          symbol: "PSX",
          abaId: "commodities_energy",
          classId: "commodities_energy",
          data: "2026-08-18",
          score: 0.84,
          instrumentQuality: "Preferred",
          stage: "Ascendente",
          stageLabel: "Accumulate",
          entryTiming: "Wait",
          entryValidated: false,
          perf1dPct: 0.2,
          perf7dPct: 0.8,
          indicators: [],
        },
        OXY: {
          symbol: "OXY",
          abaId: "commodities_energy",
          classId: "commodities_energy",
          data: "2026-08-18",
          score: 0.4,
          instrumentQuality: "Competitive",
          stage: "Maduro",
          stageLabel: "Hold",
          entryTiming: "Wait",
          entryValidated: false,
          perf1dPct: 3.1,
          perf7dPct: 5.0,
          indicators: [],
        },
      }),
      previous: snapshot({
        MPC: {
          symbol: "MPC",
          abaId: "commodities_energy",
          classId: "commodities_energy",
          data: "2026-08-17",
          score: 0.7,
          instrumentQuality: "Preferred",
          stage: "Ascendente",
          stageLabel: "Accumulate",
          entryTiming: "Wait",
          entryValidated: false,
          indicators: [],
        },
      }),
    });
    const wait = view.approaching.rows.filter((row) => row.kind === "wait");
    expect(wait[0]?.symbol).toBe("MPC");
    expect(wait[0]?.proximity.value).toBe("0.15");
    expect(wait[0]?.proximity.axis).toBe("Class");
    expect(wait.map((row) => row.symbol).slice(0, 3)).toEqual(["MPC", "PSX", "OXY"]);
    expect(wait.find((row) => row.symbol === "OXY")?.proximity.distance).toBeCloseTo(
      0.25,
    );
  });

  it("does not treat missing quotes as a loss vs cost", () => {
    const view = buildHomingView({
      names,
      holdings: [
        holding({ symbol: "NVDA", last: 110 }),
        holding({
          symbol: "MISSING",
          last: null,
          statusInput: {
            price: null,
            costPrice: 5000,
            quantity: 10,
            targetMin: null,
            targetMax: null,
            allocation: "Hold",
            instrumentQuality: "Competitive",
            entryTiming: "Wait",
          },
        }),
      ],
      current: snapshot({}),
      previous: null,
    });
    expect(view.book.incomplete).toBe(true);
    expect(view.book.invested).toBe(1000 + 50_000);
    expect(view.book.quotedCost).toBe(1000);
    expect(view.book.unquotedCost).toBe(50_000);
    expect(view.book.gross).toBe(1100);
    expect(view.book.vsCostAbs).toBe(100);
    expect(view.book.narrative).toMatch(/no live quote/i);
  });

  it("uses the reconstructed path for vs 2 sessions ago", () => {
    const view = buildHomingView({
      names,
      holdings: [holding({ symbol: "NVDA", last: 110, changePercent: 0 })],
      current: snapshot({}),
      previous: null,
      bookHistory: [
        { label: "2026-08-16", value: 1000 },
        { label: "2026-08-17", value: 1080 },
        { label: "2026-08-18", value: 1100 },
      ],
    });
    expect(view.book.priorGross).toBe(1000);
    expect(view.book.priorPnl).toBe(100);
    expect(view.book.chart[view.book.chart.length - 1]?.label).toBe("Now");
  });
});

describe("composeHomingEmail", () => {
  it("prints both chapters and links Daily Digest", () => {
    const view = buildHomingView({
      names,
      holdings: [holding({ symbol: "NVDA" })],
      current: snapshot({ CLOZ: clozNow, VCLT: vcltNow, NEM: nemNow }),
      previous: snapshot({ CLOZ: clozPrev }),
    });
    const mail = composeHomingEmail({
      view,
      walletUrl: "https://financial-advisor-sable.vercel.app/homing",
    });
    expect(mail.subject).toContain("Daily Digest");
    expect(mail.text).toContain("MY BOOK");
    expect(mail.text).toContain("You paid");
    expect(mail.text).toContain("Worth now");
    expect(mail.text).toContain("APPROACHING A BUY");
    expect(mail.text).toContain("CLOZ");
    expect(mail.html).toContain("Daily Digest");
    expect(mail.html).toContain("/homing");
  });
});
