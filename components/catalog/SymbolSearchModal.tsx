"use client";

import { ASSET_CLASS_TABS } from "@/lib/catalog/asset-classes";
import type { CatalogSearchResult } from "@/lib/catalog/types";
import { useCallback, useEffect, useRef, useState } from "react";

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
  if (!kind) return "ativo";
  const map: Record<string, string> = {
    etf: "fund etf",
    stock: "ação",
    forex: "forex",
    commodity: "commodity",
    futures: "futuros",
    etn: "etn",
    trust: "trust",
    cef: "fund",
    index: "índice",
    other: "outro",
  };
  return map[kind] ?? kind;
}

export function SymbolSearchModal({ open, onClose }: SymbolSearchModalProps) {
  const [query, setQuery] = useState("");
  const [classId, setClassId] = useState("all");
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadWatchlist = useCallback(async () => {
    const res = await fetch("/api/watchlist");
    if (!res.ok) return;
    const json = (await res.json()) as { data: WatchlistItem[] };
    setWatchlist(json.data);
  }, []);

  const runSearch = useCallback(
    async (q: string, cls: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ class: cls, limit: "30" });
        if (q.trim()) params.set("q", q.trim());
        const res = await fetch(`/api/catalog/search?${params}`);
        if (!res.ok) return;
        const json = (await res.json()) as { data: CatalogSearchResult[] };
        setResults(json.data);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

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
      await fetch("/api/watchlist", {
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
    }
    await loadWatchlist();
    void runSearch(query, classId);
  };

  if (!open) return null;

  const watchlistSymbols = new Set(watchlist.map((w) => w.symbol));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-16 pb-8"
      role="dialog"
      aria-modal="true"
      aria-label="Buscar ativos"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(720px,calc(100vh-6rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-2xl"
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
            placeholder="Símbolo, ISIN ou CUSIP"
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-xs text-zinc-400 hover:text-white"
            >
              Limpar
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-900 hover:text-white"
            aria-label="Fechar"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 px-3 py-2 scrollbar-thin">
          {ASSET_CLASS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setClassId(tab.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                classId === tab.id
                  ? "bg-white text-black"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {watchlist.length > 0 && !query ? (
            <section className="border-b border-zinc-800 px-4 py-3">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Meus interesses
              </h3>
              <ul className="space-y-1">
                {watchlist.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-zinc-950"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-white">{item.symbol}</span>
                      <span className="ml-2 truncate text-sm text-zinc-500">{item.name}</span>
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
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">
              Nenhum ativo encontrado na base.
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
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          starred ? "bg-amber-500/20 text-amber-400" : "bg-zinc-900 text-zinc-400"
                        }`}
                      >
                        {item.symbol.slice(0, 2)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-white">{item.symbol}</span>
                          <span className="truncate text-sm text-zinc-500">{item.name}</span>
                        </div>
                      </div>
                      <div className="hidden shrink-0 text-right text-xs text-zinc-500 sm:block">
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
          Busca limitada ao catálogo e base do projeto. Não constitui recomendação de investimento.
        </p>
      </div>
    </div>
  );
}
