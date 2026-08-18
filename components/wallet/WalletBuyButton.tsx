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
      className="shrink-0 rounded px-0.5 font-semibold leading-none text-emerald-400 transition-colors hover:text-emerald-300"
    >
      <span className="text-[15px]" aria-hidden>
        $
      </span>
    </button>
  );
}
