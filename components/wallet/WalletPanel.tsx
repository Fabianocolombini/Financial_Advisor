"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatPerf, formatPrice, perfClass } from "@/lib/format-market";
import type { WalletAlertView, WalletHoldingView } from "@/lib/wallet/types";
import type { WalletBuyPayload } from "@/lib/wallet/buy-event";
import { formatBandPrice, type SuggestedBands } from "@/lib/wallet/suggested-bands";
import { summarizeWallet } from "@/lib/wallet/summary";
import { WalletBandBar, WalletPnl } from "./WalletBandBar";
import { WalletHoldingForm } from "./WalletHoldingForm";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatUsd(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return USD.format(value);
}

const TONE: Record<string, string> = {
  positive: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  neutral: "bg-zinc-800 text-zinc-300 ring-zinc-700",
  caution: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  negative: "bg-red-500/10 text-red-300 ring-red-500/30",
};

export function WalletPanel({
  compact = false,
  pendingBuy = null,
  onPendingConsumed,
}: {
  compact?: boolean;
  pendingBuy?: WalletBuyPayload | null;
  onPendingConsumed?: () => void;
}) {
  const [holdings, setHoldings] = useState<WalletHoldingView[]>([]);
  const [alert, setAlert] = useState<WalletAlertView | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveBands, setLiveBands] = useState<SuggestedBands | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/wallet");
    if (!res.ok) {
      setError("Could not load the wallet.");
      setLoading(false);
      return [] as WalletHoldingView[];
    }
    const json = (await res.json()) as {
      data: { holdings: WalletHoldingView[]; alert: WalletAlertView | null };
    };
    setHoldings(json.data.holdings);
    setAlert(json.data.alert);
    setError(null);
    setLoading(false);
    return json.data.holdings;
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/wallet")
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        return (await res.json()) as {
          data: { holdings: WalletHoldingView[]; alert: WalletAlertView | null };
        };
      })
      .then((json) => {
        if (cancelled) return;
        setHoldings(json.data.holdings);
        setAlert(json.data.alert);
        setError(null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Could not load the wallet.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismissAlert = async () => {
    await fetch("/api/wallet/alerts/read", { method: "POST" });
    setAlert((a) => (a ? { ...a, read: true } : a));
  };

  const remove = async (id: string) => {
    await fetch(`/api/wallet?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (selected === id) setSelected(null);
    await reload();
  };

  const showForm = adding || pendingBuy != null;

  const active = holdings.find((h) => h.id === selected) ?? null;
  const activeSymbol = active?.symbol;
  const activeClassId = active?.classId;

  useEffect(() => {
    if (!activeSymbol || !activeClassId) return;
    let cancelled = false;
    fetch(
      `/api/wallet/bands?symbol=${encodeURIComponent(activeSymbol)}&classId=${encodeURIComponent(activeClassId)}`,
    )
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { data: SuggestedBands };
      })
      .then((json) => {
        if (cancelled || !json?.data) return;
        setLiveBands(json.data);
      })
      .catch(() => {
        /* live bands are a hint */
      });
    return () => {
      cancelled = true;
    };
  }, [activeSymbol, activeClassId]);
  const unread = alert && !alert.read && alert.items.length > 0;
  const totals = summarizeWallet(holdings);

  return (
    <div className="flex h-full flex-col">
      {unread ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-[11px] font-medium text-amber-200">
            {alert.items.length} name{alert.items.length === 1 ? "" : "s"} need a decision
          </p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-amber-100/80">
            {alert.items.slice(0, 4).map((item) => (
              <li key={item.symbol}>
                {item.symbol}: {item.label}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void dismissAlert()}
            className="mt-1 text-[11px] text-amber-200/70 underline-offset-2 hover:underline"
          >
            Mark as read
          </button>
        </div>
      ) : null}

      {!(compact && showForm) ? (
      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-[11px] text-zinc-500">
          {holdings.length === 0
            ? "No names bought yet"
            : `${holdings.length} name${holdings.length === 1 ? "" : "s"}`}
        </p>
        <button
          type="button"
          onClick={() => {
            if (showForm) {
              setAdding(false);
              onPendingConsumed?.();
            } else {
              setAdding(true);
            }
          }}
          className="text-[11px] text-zinc-300 hover:text-white"
        >
          {showForm ? "Close" : "+ Buy"}
        </button>
      </div>
      ) : null}

      {holdings.length > 0 && !loading ? (
        <dl className="border-b border-zinc-800 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <dt className="text-zinc-500">Invested</dt>
            <dd className="tabular-nums text-zinc-200">{formatUsd(totals.invested)}</dd>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2 text-[11px]">
            <dt className="text-zinc-500">Gross now</dt>
            <dd className="tabular-nums text-white">{formatUsd(totals.gross)}</dd>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2 text-[11px]">
            <dt className="text-zinc-500">
              Net after {Math.round(totals.taxRate * 100)}% tax
            </dt>
            <dd
              className={`tabular-nums ${
                totals.profit == null
                  ? "text-zinc-400"
                  : totals.profit >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
              }`}
            >
              {formatUsd(totals.net)}
            </dd>
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-zinc-600">
            {totals.tax != null && totals.tax > 0
              ? `Tax of ${formatUsd(totals.tax)} on profit only. `
              : "No tax while the book is at a loss. "}
            Educational 15% — not a tax filing.
            {totals.incomplete ? " Some names still have no live quote." : ""}
          </p>
        </dl>
      ) : null}

      {showForm ? (
        <div className="border-b border-zinc-800 px-3 pb-4 pt-1">
          <WalletHoldingForm
            key={pendingBuy?.symbol ?? "manual"}
            initial={
              pendingBuy
                ? {
                    symbol: pendingBuy.symbol,
                    classId: pendingBuy.classId,
                    name: pendingBuy.name,
                    exchange: pendingBuy.exchange,
                    kind: pendingBuy.kind,
                  }
                : undefined
            }
            lastPrice={pendingBuy?.lastPrice}
            onSaved={(symbol) => {
              setAdding(false);
              onPendingConsumed?.();
              void reload().then((rows) => {
                const row = rows.find((h) => h.symbol === symbol);
                if (row) setSelected(row.id);
              });
            }}
            onCancel={() => {
              setAdding(false);
              onPendingConsumed?.();
            }}
          />
        </div>
      ) : null}

      {loading ? (
        <p className="px-3 py-4 text-xs text-zinc-500">Loading…</p>
      ) : error ? (
        <p className="px-3 py-4 text-xs text-red-400">{error}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {holdings.map((row) => {
            const on = row.id === selected;
            return (
              <li key={row.id} className={on ? "bg-zinc-900/80" : undefined}>
                <button
                  type="button"
                  onClick={() => setSelected(on ? null : row.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-900/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-white">{row.symbol}</span>
                      <span
                        className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] ring-1 ring-inset ${TONE[row.status.action.tone]}`}
                      >
                        {row.status.action.label}
                      </span>
                    </div>
                    <p className="truncate text-[10px] text-zinc-500">{row.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums text-xs text-white">
                      {formatPrice(row.last)}
                    </p>
                    <p className={`text-[10px] tabular-nums ${perfClass(row.changePercent)}`}>
                      {formatPerf(row.changePercent)}
                    </p>
                    <p className="text-[10px]">
                      <WalletPnl
                        pnlAbs={row.status.pnlAbs}
                        pnlPct={row.status.pnlPct}
                        currency={row.currency}
                      />
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {active ? (
        <div className="border-t border-zinc-800 px-3 py-3">
          <p className="text-xs font-medium text-white">{active.symbol}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
            {active.status.action.hint}
          </p>
          <div className="mt-3">
            <WalletBandBar
              cost={active.costPrice}
              last={active.last}
              low={active.status.band.low}
              high={active.status.band.high}
              fraction={active.status.band.fraction}
              hitMin={active.status.band.hitMin}
              hitMax={active.status.band.hitMax}
              hasUserBands={active.status.band.hasUserBands}
            />
          </div>
          {liveBands &&
          (liveBands.floor ||
            liveBands.ceiling ||
            (liveBands.resistances?.length ?? 0) > 0) ? (
            <div className="mt-2 space-y-1 text-[10px] text-zinc-500">
              {liveBands.floor ? (
                <p>
                  Next floor now: {formatBandPrice(liveBands.floor.price)} ·{" "}
                  {liveBands.floor.source}
                </p>
              ) : null}
              {(liveBands.resistances ?? []).length > 0 ? (
                <div>
                  <p className="font-medium text-zinc-400">3 resistances ahead</p>
                  {(liveBands.resistances ?? []).map((row, i) => (
                    <p key={`${row.price}-${row.source}`}>
                      R{i + 1} {formatBandPrice(row.price)} · {row.source}
                      {i === 0 &&
                      active.targetMax != null &&
                      row.price > active.targetMax + 1e-6 ? (
                        <button
                          type="button"
                          className="ml-2 text-sky-400 hover:underline"
                          onClick={() => {
                            void fetch("/api/wallet", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                symbol: active.symbol,
                                classId: active.classId,
                                name: active.name,
                                exchange: active.exchange,
                                kind: active.kind,
                                quantity: active.quantity,
                                costPrice: active.costPrice,
                                purchasedAt: active.purchasedAt.slice(0, 10),
                                targetMin: active.targetMin,
                                targetMax: row.price,
                              }),
                            }).then(() => reload());
                          }}
                        >
                          update ceiling
                        </button>
                      ) : null}
                    </p>
                  ))}
                </div>
              ) : liveBands.ceiling ? (
                <p>
                  Next ceiling now: {formatBandPrice(liveBands.ceiling.price)} ·{" "}
                  {liveBands.ceiling.source}
                </p>
              ) : null}
            </div>
          ) : null}
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            <div>
              Bought <span className="text-zinc-300">{formatPrice(active.costPrice)}</span>
            </div>
            <div>
              Qty <span className="text-zinc-300">{active.quantity}</span>
            </div>
            <div>
              Vs cost{" "}
              <span className={perfClass(active.status.vsCostPct)}>
                {formatPerf(active.status.vsCostPct)}
              </span>
            </div>
            <div>
              Result{" "}
              <WalletPnl
                pnlAbs={active.status.pnlAbs}
                pnlPct={active.status.pnlPct}
                currency={active.currency}
              />
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/mercado/${active.symbol}?tab=motor`}
              className="text-[11px] text-sky-400 hover:underline"
            >
              Full analysis
            </Link>
            <button
              type="button"
              onClick={() => void remove(active.id)}
              className="text-[11px] text-zinc-500 hover:text-red-400"
            >
              Remove
            </button>
          </div>
        </div>
      ) : !compact ? (
        <p className="border-t border-zinc-800 px-3 py-3 text-[11px] text-zinc-600">
          Click a name to see the floor, the ceiling, and the recommendation vs purchase
          price.
        </p>
      ) : null}
    </div>
  );
}
