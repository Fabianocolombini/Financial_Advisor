import { entrySetup } from "@/lib/motor/entry-setup";
import {
  buyProximity,
  compareBuyProximity,
  type BuyProximity,
} from "@/lib/motor/buy-proximity";
import {
  newMoneyGlyph,
  type PlainLabel,
} from "@/lib/motor/plain-language";
import type {
  MotorDashboardSnapshot,
  MotorTickerSnapshot,
} from "@/lib/motor/snapshot-types";
import { actionNeedsAlert } from "@/lib/wallet/position-status";
import { summarizeWallet } from "@/lib/wallet/summary";
import type { WalletAlertView, WalletHoldingView } from "@/lib/wallet/types";

const BUY_LIMIT = 10;
const PRICE_SLOTS = 3;
const SCORE_JUMP = 0.03;
const HISTORY_POINTS = 20;

export type HomingChartPoint = {
  label: string;
  value: number;
};

export type HomingLotRow = {
  symbol: string;
  name: string;
  quantity: number;
  costPrice: number;
  last: number | null;
  costValue: number;
  marketValue: number | null;
  dayPct: number | null;
  vsCostPct: number | null;
  vsCostAbs: number | null;
  dayPnl: number | null;
  action: string;
  hint: string;
  purchasedAt: string;
};

export type HomingBuyKind = "can-add" | "wait" | "price";

export type HomingBuyRow = {
  symbol: string;
  name: string;
  classLabel: string;
  score: number;
  scoreDelta: number | null;
  perf1dPct: number | null;
  perf7dPct: number | null;
  moneyLabel: string;
  moneyGlyph: string;
  moneyHint: string;
  kind: HomingBuyKind;
  proximity: BuyProximity;
};

export type HomingViewModel = {
  asOf: string | null;
  hasPreviousSnapshot: boolean;
  decisionItems: WalletAlertView["items"];
  book: {
    invested: number;
    quotedCost: number;
    gross: number | null;
    vsCostAbs: number | null;
    vsCostPct: number | null;
    yesterdayGross: number | null;
    priorGross: number | null;
    dayPnl: number | null;
    dayPct: number | null;
    priorPnl: number | null;
    priorPct: number | null;
    chart: HomingChartPoint[];
    narrative: string;
    lots: HomingLotRow[];
    decisionCount: number;
    quotedLots: number;
    totalLots: number;
    incomplete: boolean;
    unquotedCost: number;
    empty: boolean;
  };
  approaching: {
    canAddCount: number;
    waitCount: number;
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

export type HomingPriceBar = {
  date: string;
  value: number;
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

function priceOnOrBefore(bars: HomingPriceBar[], date: string): number | null {
  let px: number | null = null;
  for (const bar of bars) {
    if (bar.date > date) break;
    if (Number.isFinite(bar.value)) px = bar.value;
  }
  return px;
}

/**
 * Rebuild the book's market value session by session from Yahoo closes,
 * from each lot's purchase date forward. The sparkline keeps the last
 * `HISTORY_POINTS` sessions — since-purchase P&L is cost vs worth now.
 */
export function reconstructBookHistory(
  holdings: Array<{
    symbol: string;
    quantity: number;
    purchasedAt: string;
    last: number | null;
  }>,
  barsBySymbol: Record<string, HomingPriceBar[]>,
): HomingChartPoint[] {
  const dates = new Set<string>();
  for (const bars of Object.values(barsBySymbol)) {
    bars.sort((a, b) => a.date.localeCompare(b.date));
    for (const bar of bars) dates.add(bar.date);
  }
  const sorted = [...dates].sort();
  if (sorted.length === 0) return [];

  const points: HomingChartPoint[] = [];
  for (const date of sorted) {
    let total = 0;
    let used = 0;
    for (const holding of holdings) {
      const bought = holding.purchasedAt.slice(0, 10);
      if (bought > date) continue;
      const bars = barsBySymbol[holding.symbol.toUpperCase()] ?? [];
      const price = priceOnOrBefore(bars, date) ?? holding.last;
      if (price == null || !Number.isFinite(price) || holding.quantity <= 0) {
        continue;
      }
      total += price * holding.quantity;
      used += 1;
    }
    if (used === 0) continue;
    points.push({ label: date, value: total });
  }
  return points.slice(-HISTORY_POINTS);
}

function bookNarrative(
  lots: HomingLotRow[],
  empty: boolean,
  incomplete: boolean,
): string {
  if (empty) {
    return "No names bought yet. Daily Digest still shows who is approaching a buy.";
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
  if (incomplete) {
    parts.push(
      "Some lots have no live quote yet — worth now covers only the names with a price.",
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
  waitCount: number;
  hasPreviousSnapshot: boolean;
  flippedCount: number;
}): string {
  const priceRow = input.rows.find((row) => row.kind === "price");
  const priceNote = priceRow
    ? ` ${priceRow.symbol} ${priceRow.perf1dPct != null && priceRow.perf1dPct >= 0 ? "rose" : "moved"} with ${priceRow.moneyGlyph} ${priceRow.moneyLabel.toLowerCase()} — that is the price, not an entry.`
    : "";

  if (input.canAddCount === 0 && input.waitCount === 0) {
    return `No name is in Can add or Wait. A green 1D or 7D is not a buy.${priceNote}`;
  }
  if (input.canAddCount === 0) {
    const waitLeaders = input.rows
      .filter((row) => row.kind === "wait")
      .slice(0, 3)
      .map((row) => row.symbol);
    return `Nothing is Can add yet. Closest Wait: ${waitLeaders.join(", ") || "—"}. … means do not add cash yet — the price can still print green days.${priceNote}`;
  }
  const leaders = input.rows
    .filter((row) => row.kind === "can-add")
    .slice(0, 3)
    .map((row) => row.symbol);
  if (!input.hasPreviousSnapshot) {
    return `Can add right now: ${leaders.join(", ")}. Score change vs the previous close appears after the next Motor Daily.${priceNote}`;
  }
  const jumped = input.rows.filter(
    (row) =>
      row.kind === "can-add" &&
      row.scoreDelta != null &&
      row.scoreDelta >= SCORE_JUMP,
  );
  const head = jumped.length
    ? jumped.slice(0, 3).map((row) => row.symbol)
    : leaders;
  const flip =
    input.flippedCount > 0
      ? ` ${input.flippedCount} name${input.flippedCount === 1 ? "" : "s"} flipped into Can add vs the previous close.`
      : "";
  return `${head.join(", ")} moved closest to a buy.${flip}${priceNote}`;
}

function setupFor(
  tick: MotorTickerSnapshot | undefined,
  classStage: string | null,
): PlainLabel & { gain: number | null } {
  if (!tick || tick.score == null) {
    return entrySetup({
      score: null,
      classStageLabel: classStage,
      entryTiming: null,
      entryValidated: false,
      hasMotorData: false,
      motorScope: "ticker",
    });
  }
  return entrySetup({
    score: tick.score,
    classStageLabel: classStage,
    entryTiming: tick.entryTiming ?? null,
    entryValidated: tick.entryValidated ?? false,
    hasMotorData: true,
    motorScope: "ticker",
  });
}

function wasCanAdd(tick: MotorTickerSnapshot | undefined, classStage: string | null) {
  return setupFor(tick, classStage).label === "Can add";
}

function buyKind(label: string): HomingBuyKind {
  if (label === "Can add") return "can-add";
  if (label === "Wait") return "wait";
  return "price";
}

function byCloserThenPrice(a: HomingBuyRow, b: HomingBuyRow): number {
  const proximity = compareBuyProximity(
    a.proximity,
    b.proximity,
    a.score,
    b.score,
  );
  if (proximity !== 0) return proximity;
  const da = a.scoreDelta ?? -999;
  const db = b.scoreDelta ?? -999;
  if (db !== da) return db - da;
  return (b.perf1dPct ?? -999) - (a.perf1dPct ?? -999);
}

function takeRows(
  source: HomingBuyRow[],
  into: HomingBuyRow[],
  seen: Set<string>,
  limit: number,
) {
  for (const row of source) {
    if (into.length >= limit) return;
    const key = row.symbol.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    into.push(row);
  }
}

function impliedDayBook(holdings: WalletHoldingView[]): {
  yesterdayGross: number | null;
  dayPnl: number | null;
  dayPct: number | null;
  gross: number | null;
} {
  const totals = summarizeWallet(holdings);
  let yesterdayGross: number | null = 0;
  let yesterdayLots = 0;
  for (const holding of holdings) {
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
  return { yesterdayGross, dayPnl, dayPct, gross: totals.gross };
}

export function buildHomingView(input: {
  holdings: WalletHoldingView[];
  current: MotorDashboardSnapshot | null;
  previous: MotorDashboardSnapshot | null;
  names: HomingNameIndex;
  bookHistory?: HomingChartPoint[];
}): HomingViewModel {
  const totals = summarizeWallet(input.holdings);
  const empty = input.holdings.length === 0;
  const lotRows: HomingLotRow[] = input.holdings.map((holding) => {
    const y = yesterdayValue(holding);
    const today = holding.status.marketValue;
    const dayPnl =
      y != null && today != null && Number.isFinite(today) ? today - y : null;
    const vsCostAbs =
      today != null && Number.isFinite(today)
        ? today - holding.status.costValue
        : null;
    return {
      symbol: holding.symbol,
      name: holding.name,
      quantity: holding.quantity,
      costPrice: holding.costPrice,
      last: holding.last,
      costValue: holding.status.costValue,
      marketValue: today,
      dayPct: holding.changePercent,
      vsCostPct: holding.status.vsCostPct,
      vsCostAbs,
      dayPnl,
      action: holding.status.action.label,
      hint: holding.status.action.hint,
      purchasedAt: holding.purchasedAt,
    };
  });
  lotRows.sort((a, b) => Math.abs(b.dayPnl ?? 0) - Math.abs(a.dayPnl ?? 0));

  const implied = impliedDayBook(input.holdings);
  const history = input.bookHistory ?? [];
  const yesterdayGross = implied.yesterdayGross;
  const priorGross =
    history.length >= 3
      ? history[history.length - 3]!.value
      : history.length >= 2
        ? history[history.length - 2]!.value
        : null;

  const dayPnl =
    totals.gross != null && yesterdayGross != null
      ? totals.gross - yesterdayGross
      : implied.dayPnl;
  const dayPct =
    dayPnl != null && yesterdayGross != null && yesterdayGross !== 0
      ? (dayPnl / yesterdayGross) * 100
      : implied.dayPct;
  const priorPnl =
    totals.gross != null && priorGross != null
      ? totals.gross - priorGross
      : null;
  const priorPct =
    priorPnl != null && priorGross != null && priorGross !== 0
      ? (priorPnl / priorGross) * 100
      : null;

  const chart: HomingChartPoint[] = [...history];
  if (totals.gross != null) {
    const nowLabel = "Now";
    const last = chart[chart.length - 1];
    if (!last || last.label !== nowLabel) {
      chart.push({ label: nowLabel, value: totals.gross });
    }
  } else if (chart.length === 0 && yesterdayGross != null) {
    chart.push({ label: "Yesterday", value: yesterdayGross });
  }

  const vsCostAbs =
    totals.gross != null ? totals.gross - totals.quotedCost : null;
  const vsCostPct =
    vsCostAbs != null && totals.quotedCost !== 0
      ? (vsCostAbs / totals.quotedCost) * 100
      : null;

  const owned = new Set(input.holdings.map((row) => row.symbol.toUpperCase()));
  const buyCandidates: HomingBuyRow[] = [];
  let canAddCount = 0;
  let waitCount = 0;
  let scoreJumpedCount = 0;
  let flippedCount = 0;
  const tickers = input.current?.tickers ?? {};

  for (const [symbol, tick] of Object.entries(tickers)) {
    if (owned.has(symbol.toUpperCase())) continue;
    if (tick.score == null || !Number.isFinite(tick.score)) continue;
    const classSnap = input.current?.classes[tick.classId];
    const classStage = classSnap?.stageLabel ?? classSnap?.allocationAction ?? null;
    const money = setupFor(tick, classStage);
    if (money.label === "Can add") canAddCount += 1;
    if (money.label === "Wait") waitCount += 1;
    const prevTick = input.previous?.tickers[symbol];
    const prevClass = input.previous?.classes[tick.classId];
    const prevStage =
      prevClass?.stageLabel ?? prevClass?.allocationAction ?? null;
    const scoreDelta =
      prevTick?.score != null && Number.isFinite(prevTick.score)
        ? tick.score - prevTick.score
        : null;
    if (
      money.label === "Can add" &&
      scoreDelta != null &&
      scoreDelta >= SCORE_JUMP
    ) {
      scoreJumpedCount += 1;
    }
    if (input.previous && money.label === "Can add" && !wasCanAdd(prevTick, prevStage)) {
      flippedCount += 1;
    }
    buyCandidates.push({
      symbol,
      name: input.names.name(symbol),
      classLabel: input.names.classLabel(tick.classId),
      score: tick.score,
      scoreDelta,
      perf1dPct: tick.perf1dPct ?? null,
      perf7dPct: tick.perf7dPct ?? null,
      moneyLabel: money.label,
      moneyGlyph: newMoneyGlyph(money.label),
      moneyHint: money.hint,
      kind: buyKind(money.label),
      proximity: buyProximity({
        classId: tick.classId,
        regimeScore:
          classSnap?.allocationScore ??
          classSnap?.regimeModel?.score ??
          classSnap?.score ??
          null,
        securityScore: tick.score,
        allocationAction:
          classSnap?.allocationAction ??
          classSnap?.regimeModel?.action ??
          classStage,
        instrumentQuality: tick.instrumentQuality ?? null,
        divergesFromClass: tick.divergesFromClass ?? false,
      }),
    });
  }

  const canAdd = buyCandidates
    .filter((row) => row.kind === "can-add")
    .sort(byCloserThenPrice);
  const wait = buyCandidates
    .filter((row) => row.kind === "wait")
    .sort(byCloserThenPrice);
  const by1d = [...buyCandidates].sort(
    (a, b) => (b.perf1dPct ?? -999) - (a.perf1dPct ?? -999),
  );

  const approachingRows: HomingBuyRow[] = [];
  const seen = new Set<string>();
  const modelSlots = Math.max(1, BUY_LIMIT - PRICE_SLOTS);
  takeRows(canAdd, approachingRows, seen, modelSlots);
  takeRows(wait, approachingRows, seen, modelSlots);
  takeRows(by1d, approachingRows, seen, BUY_LIMIT);

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
      quotedCost: totals.quotedCost,
      gross: totals.gross,
      vsCostAbs,
      vsCostPct,
      yesterdayGross,
      priorGross,
      dayPnl,
      dayPct,
      priorPnl,
      priorPct,
      chart,
      narrative: bookNarrative(lotRows, empty, totals.incomplete),
      lots: lotRows,
      decisionCount: input.holdings.filter((holding) =>
        actionNeedsAlert(holding.status.action.action),
      ).length,
      quotedLots: totals.quotedLots,
      totalLots: totals.totalLots,
      incomplete: totals.incomplete,
      unquotedCost: totals.invested - totals.quotedCost,
      empty,
    },
    approaching: {
      canAddCount,
      waitCount,
      scoreJumpedCount,
      flippedCount,
      narrative: approachingNarrative({
        rows: approachingRows,
        canAddCount,
        waitCount,
        hasPreviousSnapshot,
        flippedCount,
      }),
      rows: approachingRows,
    },
  };
}
