import { entrySetup } from "@/lib/motor/entry-setup";
import type {
  MotorDashboardSnapshot,
  MotorTickerSnapshot,
} from "@/lib/motor/snapshot-types";
import { actionNeedsAlert } from "@/lib/wallet/position-status";
import { summarizeWallet } from "@/lib/wallet/summary";
import type { WalletAlertView, WalletHoldingView } from "@/lib/wallet/types";

const BUY_LIMIT = 8;
const LOT_LIMIT = 6;
const SCORE_JUMP = 0.03;

export type HomingChartPoint = {
  label: string;
  value: number;
};

export type HomingLotRow = {
  symbol: string;
  name: string;
  dayPct: number | null;
  vsCostPct: number | null;
  dayPnl: number | null;
  action: string;
  hint: string;
};

export type HomingBuyRow = {
  symbol: string;
  name: string;
  classLabel: string;
  score: number;
  scoreDelta: number | null;
  perf1dPct: number | null;
};

export type HomingViewModel = {
  asOf: string | null;
  hasPreviousSnapshot: boolean;
  decisionItems: WalletAlertView["items"];
  book: {
    invested: number;
    gross: number | null;
    yesterdayGross: number | null;
    dayPnl: number | null;
    dayPct: number | null;
    chart: HomingChartPoint[];
    narrative: string;
    lots: HomingLotRow[];
    decisionCount: number;
    empty: boolean;
  };
  approaching: {
    canAddCount: number;
    scoreJumpedCount: number;
    flippedCount: number;
    narrative: string;
    rows: HomingBuyRow[];
  };
};

export type HomingNameIndex = {
  name: (symbol: string) => string;
  classLabel: (classId: string) => string;
};

function yesterdayValue(holding: WalletHoldingView): number | null {
  const last = holding.last;
  const qty = holding.quantity;
  const chg = holding.changePercent;
  if (last == null || !Number.isFinite(last) || qty <= 0) return null;
  if (chg == null || !Number.isFinite(chg) || chg <= -100) {
    const mv = holding.status.marketValue;
    return mv != null && Number.isFinite(mv) ? mv : last * qty;
  }
  return (last / (1 + chg / 100)) * qty;
}

function bookNarrative(lots: HomingLotRow[], empty: boolean): string {
  if (empty) {
    return "No names bought yet. Homing still shows who is approaching a buy.";
  }
  const ranked = [...lots]
    .filter((row) => row.dayPnl != null)
    .sort((a, b) => Math.abs(b.dayPnl ?? 0) - Math.abs(a.dayPnl ?? 0));
  const lifted = ranked.filter((row) => (row.dayPnl ?? 0) > 0).slice(0, 2);
  const dragged = ranked.filter((row) => (row.dayPnl ?? 0) < 0).slice(0, 2);
  const exits = lots.filter(
    (row) => row.action === "Exit" || row.action === "Downtrend — exit",
  );
  const adds = lots.filter((row) => row.action === "Buy more");
  const parts: string[] = [];
  if (lifted.length) {
    parts.push(
      `${lifted.map((row) => row.symbol).join(" and ")} carried the day.`,
    );
  }
  if (dragged.length) {
    parts.push(
      `${dragged.map((row) => row.symbol).join(" and ")} pulled the other way.`,
    );
  }
  if (adds.length) {
    parts.push(
      `Buy more is supported on ${adds.map((row) => row.symbol).join(", ")}.`,
    );
  }
  if (exits.length) {
    parts.push(
      `${exits.map((row) => row.symbol).join(", ")}: Exit — follow the plan.`,
    );
  }
  if (parts.length === 0) {
    return "The book is quiet vs yesterday. No lot needs a faster add or an exit.";
  }
  return parts.join(" ");
}

function approachingNarrative(input: {
  rows: HomingBuyRow[];
  canAddCount: number;
  hasPreviousSnapshot: boolean;
  flippedCount: number;
}): string {
  if (input.canAddCount === 0) {
    return "No name is in Can add vs yesterday. Wait for the next close.";
  }
  const leaders = input.rows.slice(0, 3).map((row) => row.symbol);
  if (!input.hasPreviousSnapshot) {
    return `Can add right now: ${leaders.join(", ")}. Score change vs the previous close appears after the next Motor Daily.`;
  }
  const jumped = input.rows.filter(
    (row) => row.scoreDelta != null && row.scoreDelta >= SCORE_JUMP,
  );
  const head = jumped.length
    ? jumped.slice(0, 3).map((row) => row.symbol)
    : leaders;
  const flip =
    input.flippedCount > 0
      ? ` ${input.flippedCount} name${input.flippedCount === 1 ? "" : "s"} flipped into Can add vs the previous close.`
      : "";
  return `${head.join(", ")} moved closest to a buy.${flip}`;
}

function wasCanAdd(tick: MotorTickerSnapshot | undefined, classStage: string | null) {
  if (!tick || tick.score == null) return false;
  return (
    entrySetup({
      score: tick.score,
      classStageLabel: classStage,
      entryTiming: tick.entryTiming ?? null,
      entryValidated: tick.entryValidated ?? false,
      hasMotorData: true,
      motorScope: "ticker",
    }).label === "Can add"
  );
}

export function buildHomingView(input: {
  holdings: WalletHoldingView[];
  current: MotorDashboardSnapshot | null;
  previous: MotorDashboardSnapshot | null;
  names: HomingNameIndex;
}): HomingViewModel {
  const totals = summarizeWallet(input.holdings);
  const empty = input.holdings.length === 0;
  const lotRows: HomingLotRow[] = input.holdings.map((holding) => {
    const y = yesterdayValue(holding);
    const today = holding.status.marketValue;
    const dayPnl =
      y != null && today != null && Number.isFinite(today) ? today - y : null;
    return {
      symbol: holding.symbol,
      name: holding.name,
      dayPct: holding.changePercent,
      vsCostPct: holding.status.vsCostPct,
      dayPnl,
      action: holding.status.action.label,
      hint: holding.status.action.hint,
    };
  });
  lotRows.sort((a, b) => Math.abs(b.dayPnl ?? 0) - Math.abs(a.dayPnl ?? 0));

  let yesterdayGross: number | null = 0;
  let yesterdayLots = 0;
  for (const holding of input.holdings) {
    const y = yesterdayValue(holding);
    if (y == null) continue;
    yesterdayGross += y;
    yesterdayLots += 1;
  }
  if (yesterdayLots === 0) yesterdayGross = null;

  const dayPnl =
    totals.gross != null && yesterdayGross != null
      ? totals.gross - yesterdayGross
      : null;
  const dayPct =
    dayPnl != null && yesterdayGross != null && yesterdayGross !== 0
      ? (dayPnl / yesterdayGross) * 100
      : null;

  const chart: HomingChartPoint[] = [];
  if (yesterdayGross != null) {
    chart.push({ label: "Yesterday", value: yesterdayGross });
  }
  if (totals.gross != null) {
    chart.push({
      label: input.current?.asOf ? `Close ${input.current.asOf}` : "Now",
      value: totals.gross,
    });
  }

  const owned = new Set(
    input.holdings.map((row) => row.symbol.toUpperCase()),
  );
  const buyCandidates: HomingBuyRow[] = [];
  let canAddCount = 0;
  let scoreJumpedCount = 0;
  let flippedCount = 0;
  const tickers = input.current?.tickers ?? {};

  for (const [symbol, tick] of Object.entries(tickers)) {
    if (owned.has(symbol.toUpperCase())) continue;
    if (tick.score == null || !Number.isFinite(tick.score)) continue;
    const classSnap = input.current?.classes[tick.classId];
    const classStage = classSnap?.stageLabel ?? classSnap?.allocationAction ?? null;
    if (
      !wasCanAdd(tick, classStage)
    ) {
      continue;
    }
    canAddCount += 1;
    const prevTick = input.previous?.tickers[symbol];
    const prevClass = input.previous?.classes[tick.classId];
    const prevStage =
      prevClass?.stageLabel ?? prevClass?.allocationAction ?? null;
    const scoreDelta =
      prevTick?.score != null && Number.isFinite(prevTick.score)
        ? tick.score - prevTick.score
        : null;
    if (scoreDelta != null && scoreDelta >= SCORE_JUMP) scoreJumpedCount += 1;
    if (input.previous && !wasCanAdd(prevTick, prevStage)) flippedCount += 1;
    buyCandidates.push({
      symbol,
      name: input.names.name(symbol),
      classLabel: input.names.classLabel(tick.classId),
      score: tick.score,
      scoreDelta,
      perf1dPct: tick.perf1dPct ?? null,
    });
  }

  buyCandidates.sort((a, b) => {
    const da = a.scoreDelta ?? -999;
    const db = b.scoreDelta ?? -999;
    if (db !== da) return db - da;
    if (b.score !== a.score) return b.score - a.score;
    return (b.perf1dPct ?? -999) - (a.perf1dPct ?? -999);
  });

  const approachingRows = buyCandidates.slice(0, BUY_LIMIT);
  const hasPreviousSnapshot = Boolean(input.previous?.asOf);

  return {
    asOf: input.current?.asOf ?? null,
    hasPreviousSnapshot,
    decisionItems: input.holdings
      .filter((holding) => actionNeedsAlert(holding.status.action.action))
      .map((holding) => ({
        symbol: holding.symbol,
        action: holding.status.action.action,
        label: holding.status.action.label,
        hint: holding.status.action.hint,
        pnlPct: holding.status.pnlPct,
      })),
    book: {
      invested: totals.invested,
      gross: totals.gross,
      yesterdayGross,
      dayPnl,
      dayPct,
      chart,
      narrative: bookNarrative(lotRows, empty),
      lots: lotRows.slice(0, LOT_LIMIT),
      decisionCount: input.holdings.filter((holding) =>
        actionNeedsAlert(holding.status.action.action),
      ).length,
      empty,
    },
    approaching: {
      canAddCount,
      scoreJumpedCount,
      flippedCount,
      narrative: approachingNarrative({
        rows: approachingRows,
        canAddCount,
        hasPreviousSnapshot,
        flippedCount,
      }),
      rows: approachingRows,
    },
  };
}
