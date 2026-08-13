"use client";

import { requestWalletBuy } from "@/lib/wallet/buy-event";

export function WalletBuyButton({
  symbol,
  classId,
  name,
  exchange,
  kind,
  lastPrice,
}: {
  symbol: string;
  classId: string;
  name: string;
  exchange: string | null;
  kind: string | null;
  lastPrice?: number | null;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        requestWalletBuy({ symbol, classId, name, exchange, kind, lastPrice });
      }}
      title="Buy and track in My Wallet"
      aria-label={`Add ${symbol} to My Wallet`}
      className="shrink-0 rounded p-0.5 text-zinc-500 transition-colors hover:text-emerald-400"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9.75A2.25 2.25 0 0018.75 7.5H5.25A2.25 2.25 0 003 9.75v2.25"
        />
      </svg>
    </button>
  );
}
