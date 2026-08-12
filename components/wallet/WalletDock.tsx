"use client";

import { useEffect, useState } from "react";
import { WALLET_BUY_EVENT, type WalletBuyPayload } from "@/lib/wallet/buy-event";
import { WalletPanel } from "./WalletPanel";

/**
 * Right-hand wallet drawer.
 *
 * Closed: a thin edge tab. Open on desktop: a column in the layout (not a
 * fixed overlay), so the page shrinks and the site header cannot cover the
 * form. Open on small screens: a sheet with a backdrop.
 */
export function WalletDock() {
  const [open, setOpen] = useState(false);
  const [pendingBuy, setPendingBuy] = useState<WalletBuyPayload | null>(null);

  useEffect(() => {
    const onBuy = (event: Event) => {
      const detail = (event as CustomEvent<WalletBuyPayload>).detail;
      setPendingBuy(detail);
      setOpen(true);
    };
    window.addEventListener(WALLET_BUY_EVENT, onBuy);
    return () => window.removeEventListener(WALLET_BUY_EVENT, onBuy);
  }, []);

  const close = () => {
    setOpen(false);
    setPendingBuy(null);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-0 top-1/3 z-40 rounded-l-md border border-r-0 border-zinc-700 bg-zinc-950 px-1.5 py-3 text-[11px] tracking-wide text-zinc-300 [writing-mode:vertical-rl] hover:bg-zinc-900 hover:text-white"
        aria-label="Abrir My Wallet"
      >
        My Wallet
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/60 md:hidden"
        aria-label="Fechar My Wallet"
        onClick={close}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex h-screen w-[min(22rem,92vw)] flex-col border-l border-zinc-800 bg-zinc-950 md:sticky md:inset-y-auto md:right-auto md:top-0 md:z-auto md:w-[22rem] md:self-start"
        aria-label="My Wallet"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2.5">
          <h2 className="text-sm font-medium text-white">My Wallet</h2>
          <button
            type="button"
            onClick={close}
            className="rounded px-2 py-1 text-[11px] text-zinc-500 hover:text-white"
            aria-label="Fechar My Wallet"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <WalletPanel
            compact
            pendingBuy={pendingBuy}
            onPendingConsumed={() => setPendingBuy(null)}
          />
        </div>
      </aside>
    </>
  );
}
