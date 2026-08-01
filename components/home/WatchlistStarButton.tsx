"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function WatchlistStarButton({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const remove = async () => {
    if (pending) return;
    setPending(true);
    try {
      await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, {
        method: "DELETE",
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void remove()}
      disabled={pending}
      title="Remove from watchlist"
      aria-label={`Remove ${symbol} from watchlist`}
      className="shrink-0 rounded p-0.5 text-sm text-amber-400 transition-colors hover:text-amber-300 disabled:opacity-40"
    >
      ★
    </button>
  );
}
