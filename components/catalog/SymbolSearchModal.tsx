"use client";

import { ASSET_CLASS_TABS } from "@/lib/catalog/asset-classes";
import type { CatalogSearchResult } from "@/lib/catalog/types";
import { SymbolAvatar } from "@/components/catalog/SymbolAvatar";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

type WatchlistItem = {
  id: string;
  symbol: string;
  classId: string;
  name: string;
  exchange: string | null;
  kind: string | null;
};

type SymbolSearchModalProps = {
  open: boolean;
  onClose: () => void;
};

function kindLabel(kind: string | undefined): string {
  if (!kind) return "asset";
  const map: Record<string, string> = {
    etf: "fund etf",
    stock: "stock",
    forex: "forex",
    commodity: "commodity",
    futures: "futures",
    etn: "etn",
    trust: "trust",
    cef: "fund",
    index: "index",
    other: "other",
  };
  return map[kind] ?? kind;
}

export function SymbolSearchModal({ open, onClose }: SymbolSearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [classId, setClassId] = useState("all");
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadWatchlist = useCallback(async () => {
    const res = await fetch("/api/watchlist");
    if (!res.ok) return;
    const json = (await res.json()) as { data: WatchlistItem[] };
    setWatchlist(json.data);
  }, []);

  const runSearch = useCallback(async (q: string, cls: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ class: cls, limit: "40" });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/catalog/search?${params}`);
      if (!res.ok) return;
      const json = (await res.json()) as { data: CatalogSearchResult[] };
      setResults(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setClassId("all");
    void loadWatchlist();
    void runSearch("", "all");
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, loadWatchlist, runSearch]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query, classId);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, classId, open, runSearch]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const toggleWatchlist = async (item: CatalogSearchResult) => {
    if (item.inWatchlist) {
      await fetch(`/api/watchlist?symbol=${encodeURIComponent(item.symbol)}`, {
        method: "DELETE",
      });
    } else {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: item.symbol,
          classId: item.classId,
          name: item.name,
          exchange: item.exchange,
          kind: item.kind,
        }),
      });
      const json = (await res.json()) as {
        motor?: { queued?: boolean };
      };
      if (json.motor?.queued) {
        router.refresh();
      }
    }
    await loadWatchlist();
    void runSearch(query, classId);
  };

  if (!open || !mounted) return null;

  const watchlistSymbols = new Set(watchlist.map((w) => w.symbol));
  const activeClassLabel =
    ASSET_CLASS_TABS.find((t) => t.id === classId)?.label ?? "All";
  const showWatchlistSection = classId === "all" && !query.trim();

  const modal = (
    <div
      className="fixed inset-x-0 bottom-0 top-[7.5rem] z-40 flex items-start justify-center bg-black/55 px-4 pb-8 pt-2 sm:top-[6.75rem]"
      role="dialog"
      aria-modal="true"
      aria-label="Search symbols"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(720px,calc(100vh-9rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <svg
            className="h-5 w-5 shrink-0 text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Symbol, ISIN or CUSIP"
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-xs text-zinc-400 hover:text-white"
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-900 hover:text-white"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="shrink-0 border-b border-zinc-800">
          <div
            className="flex items-center gap-1.5 overflow-x-auto px-3 py-2.5"
            style={{ scrollbarWidth: "thin" }}
          >
            {ASSET_CLASS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setClassId(tab.id)}
                className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-medium leading-none transition-colors ${
                  classId === tab.id
                    ? "bg-white text-black"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {classId !== "all" ? (
            <p className="border-t border-zinc-800/80 px-4 py-2 text-xs leading-snug text-zinc-500">
              Showing <span className="text-zinc-300">{activeClassLabel}</span> — top
              symbols by 90-day trading volume until 90% of class liquidity. Tap ★ to follow.
            </p>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto">
          {showWatchlistSection && watchlist.length > 0 ? (
            <section className="border-b border-zinc-800 px-4 py-3">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                All followed symbols
              </h3>
              <ul className="space-y-1">
                {watchlist.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-zinc-950"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <SymbolAvatar
                        symbol={item.symbol}
                        exchange={item.exchange ?? "NYSE"}
                        classId={item.classId}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <span className="font-title text-white">{item.symbol}</span>
                        <span className="ml-2 truncate text-sm text-zinc-500">{item.name}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void toggleWatchlist({
                          symbol: item.symbol,
                          name: item.name,
                          classId: item.classId,
                          exchange: item.exchange ?? "—",
                          kind: item.kind ?? "other",
                          source: "catalog",
                          inWatchlist: true,
                        })
                      }
                      className="shrink-0 text-xs text-amber-400 hover:text-amber-300"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">
              {query.trim()
                ? "Searching…"
                : classId !== "all"
                  ? "Ranking by volume…"
                  : "Loading…"}
            </p>
          ) : results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">
              No symbols found in {activeClassLabel}.
            </p>
          ) : (
            <ul>
              {results.map((item) => {
                const starred = item.inWatchlist ?? watchlistSymbols.has(item.symbol);
                return (
                  <li key={item.symbol}>
                    <button
                      type="button"
                      onClick={() => void toggleWatchlist(item)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-950"
                    >
                      <SymbolAvatar
                        symbol={item.symbol}
                        exchange={item.exchange}
                        classId={item.classId}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-title text-white">{item.symbol}</span>
                          {item.liquiditySharePct != null && item.liquiditySharePct > 0 ? (
                            <span className="text-xs tabular-nums text-zinc-400 sm:hidden">
                              {item.liquiditySharePct.toFixed(1)}%
                            </span>
                          ) : null}
                          <span className="truncate text-sm text-zinc-500">{item.name}</span>
                        </div>
                      </div>
                      <div className="hidden shrink-0 text-right text-xs text-zinc-500 sm:block">
                        {item.liquiditySharePct != null && item.liquiditySharePct > 0 ? (
                          <div className="tabular-nums text-zinc-300">
                            {item.liquiditySharePct.toFixed(1)}%
                          </div>
                        ) : null}
                        <div>{kindLabel(item.kind)}</div>
                        <div>{item.exchange}</div>
                      </div>
                      <span
                        className={`shrink-0 text-lg leading-none ${
                          starred ? "text-amber-400" : "text-zinc-600"
                        }`}
                        aria-hidden
                      >
                        {starred ? "★" : "☆"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="border-t border-zinc-800 px-4 py-2 text-center text-[10px] text-zinc-600">
          Catalog search only. Not investment advice.
        </p>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
