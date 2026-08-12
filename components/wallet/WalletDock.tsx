"use client";

import { useEffect, useState } from "react";
import { WALLET_BUY_EVENT, type WalletBuyPayload } from "@/lib/wallet/buy-event";
import { WalletPanel } from "./WalletPanel";

const STORAGE_KEY = "fa.wallet.dock";

type DockState = { open: boolean; pinned: boolean };

function loadDock(): DockState {
  if (typeof window === "undefined") return { open: false, pinned: false };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { open: false, pinned: false };
    const parsed = JSON.parse(raw) as Partial<DockState>;
    return {
      open: Boolean(parsed.open),
      pinned: Boolean(parsed.pinned),
    };
  } catch {
    return { open: false, pinned: false };
  }
}

function saveDock(state: DockState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/**
 * TradingView-style right tab: floats over the page, or pins and pushes content.
 */
export function WalletDock() {
  const [state, setState] = useState<DockState>({ open: false, pinned: false });
  const [pendingBuy, setPendingBuy] = useState<WalletBuyPayload | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setState(loadDock()), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onBuy = (event: Event) => {
      const detail = (event as CustomEvent<WalletBuyPayload>).detail;
      setPendingBuy(detail);
      setState((cur) => {
        const next = { ...cur, open: true };
        saveDock(next);
        return next;
      });
    };
    window.addEventListener(WALLET_BUY_EVENT, onBuy);
    return () => window.removeEventListener(WALLET_BUY_EVENT, onBuy);
  }, []);

  const setDock = (next: DockState) => {
    setState(next);
    saveDock(next);
  };

  return (
    <>
      {state.open && state.pinned ? (
        <div className="hidden w-80 shrink-0 lg:block" aria-hidden />
      ) : null}

      {!state.open ? (
        <button
          type="button"
          onClick={() => setDock({ ...state, open: true })}
          className="fixed right-0 top-1/3 z-40 origin-right -translate-y-1/2 rotate-180 rounded-l-md border border-r-0 border-zinc-700 bg-zinc-950 px-1.5 py-3 text-[11px] tracking-wide text-zinc-300 [writing-mode:vertical-rl] hover:bg-zinc-900 hover:text-white"
          aria-label="Abrir My Wallet"
        >
          My Wallet
        </button>
      ) : null}

      {state.open ? (
        <aside
          className="fixed inset-y-0 right-0 z-40 flex w-80 flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl"
          aria-label="My Wallet"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <h2 className="text-sm font-medium text-white">My Wallet</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDock({ ...state, pinned: !state.pinned })}
                className={`rounded px-2 py-1 text-[11px] ${
                  state.pinned
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                title={state.pinned ? "Desafixar (flutuar)" : "Fixar na lateral"}
              >
                {state.pinned ? "Fixo" : "Flutuar"}
              </button>
              <button
                type="button"
                onClick={() => setDock({ ...state, open: false })}
                className="rounded px-2 py-1 text-[11px] text-zinc-500 hover:text-white"
                aria-label="Fechar My Wallet"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <WalletPanel
              compact
              pendingBuy={pendingBuy}
              onPendingConsumed={() => setPendingBuy(null)}
            />
          </div>
        </aside>
      ) : null}
    </>
  );
}
