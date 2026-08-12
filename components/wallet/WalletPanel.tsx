"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatPerf, formatPrice, perfClass } from "@/lib/format-market";
import type { WalletAlertView, WalletHoldingView } from "@/lib/wallet/types";
import { WalletBandBar, WalletPnl } from "./WalletBandBar";
import { WalletHoldingForm } from "./WalletHoldingForm";

const TONE: Record<string, string> = {
  positive: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  neutral: "bg-zinc-800 text-zinc-300 ring-zinc-700",
  caution: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  negative: "bg-red-500/10 text-red-300 ring-red-500/30",
};

export function WalletPanel({ compact = false }: { compact?: boolean }) {
  const [holdings, setHoldings] = useState<WalletHoldingView[]>([]);
  const [alert, setAlert] = useState<WalletAlertView | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/wallet");
    if (!res.ok) {
      setError("Não foi possível carregar a carteira.");
      setLoading(false);
      return;
    }
    const json = (await res.json()) as {
      data: { holdings: WalletHoldingView[]; alert: WalletAlertView | null };
    };
    setHoldings(json.data.holdings);
    setAlert(json.data.alert);
    setError(null);
    setLoading(false);
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
        setError("Não foi possível carregar a carteira.");
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

  const active = holdings.find((h) => h.id === selected) ?? null;
  const unread = alert && !alert.read && alert.items.length > 0;

  return (
    <div className="flex h-full flex-col">
      {unread ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-[11px] font-medium text-amber-200">
            {alert.items.length} papel{alert.items.length === 1 ? "" : "es"} pedem decisão
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
            Marcar como lido
          </button>
        </div>
      ) : null}

      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-[11px] text-zinc-500">
          {holdings.length === 0
            ? "Nenhum papel comprado ainda"
            : `${holdings.length} papel${holdings.length === 1 ? "" : "es"}`}
        </p>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-[11px] text-zinc-300 hover:text-white"
        >
          {adding ? "Fechar" : "+ Comprar"}
        </button>
      </div>

      {adding ? (
        <div className="border-b border-zinc-800 px-3 pb-3">
          <WalletHoldingForm
            onSaved={() => {
              setAdding(false);
              void reload();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : null}

      {loading ? (
        <p className="px-3 py-4 text-xs text-zinc-500">Carregando…</p>
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
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            <div>
              Compra <span className="text-zinc-300">{formatPrice(active.costPrice)}</span>
            </div>
            <div>
              Qtd <span className="text-zinc-300">{active.quantity}</span>
            </div>
            <div>
              Vs compra{" "}
              <span className={perfClass(active.status.vsCostPct)}>
                {formatPerf(active.status.vsCostPct)}
              </span>
            </div>
            <div>
              Resultado{" "}
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
              Análise completa
            </Link>
            <button
              type="button"
              onClick={() => void remove(active.id)}
              className="text-[11px] text-zinc-500 hover:text-red-400"
            >
              Remover
            </button>
          </div>
        </div>
      ) : !compact ? (
        <p className="border-t border-zinc-800 px-3 py-3 text-[11px] text-zinc-600">
          Clique em um papel para ver o piso, o teto e a recomendação vs o preço de
          compra.
        </p>
      ) : null}
    </div>
  );
}
