"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { CatalogSearchResult } from "@/lib/catalog/types";

export type HoldingDraft = {
  symbol: string;
  classId: string;
  name: string;
  exchange: string | null;
  kind: string | null;
  quantity: string;
  costPrice: string;
  purchasedAt: string;
  targetMin: string;
  targetMax: string;
};

const emptyDraft = (): HoldingDraft => ({
  symbol: "",
  classId: "",
  name: "",
  exchange: null,
  kind: null,
  quantity: "",
  costPrice: "",
  purchasedAt: new Date().toISOString().slice(0, 10),
  targetMin: "",
  targetMax: "",
});

export function WalletHoldingForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Partial<HoldingDraft>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<HoldingDraft>({ ...emptyDraft(), ...initial });
  const [query, setQuery] = useState(initial?.symbol ?? "");
  const [hits, setHits] = useState<CatalogSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query.trim().length < 1) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(
        `/api/catalog/search?q=${encodeURIComponent(query)}&limit=8`,
      );
      if (!res.ok) return;
      const json = (await res.json()) as { data: CatalogSearchResult[] };
      setHits(json.data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const pick = (hit: CatalogSearchResult) => {
    setDraft((d) => ({
      ...d,
      symbol: hit.symbol,
      classId: hit.classId,
      name: hit.name,
      exchange: hit.exchange,
      kind: hit.kind,
    }));
    setQuery(hit.symbol);
    setHits([]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const quantity = Number(draft.quantity);
    const costPrice = Number(draft.costPrice);
    const targetMin = draft.targetMin.trim() ? Number(draft.targetMin) : null;
    const targetMax = draft.targetMax.trim() ? Number(draft.targetMax) : null;
    if (!draft.symbol || !draft.classId) {
      setError("Escolha o papel na busca.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Quantidade inválida.");
      return;
    }
    if (!Number.isFinite(costPrice) || costPrice <= 0) {
      setError("Preço de compra inválido.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: draft.symbol,
          classId: draft.classId,
          name: draft.name,
          exchange: draft.exchange,
          kind: draft.kind,
          quantity,
          costPrice,
          purchasedAt: draft.purchasedAt,
          targetMin,
          targetMax,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Não foi possível salvar.");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="block text-[11px] text-zinc-500">
        Papel
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setDraft((d) => ({ ...d, symbol: "", classId: "", name: "" }));
          }}
          placeholder="SGOV, SPY…"
          className="mt-1 w-full rounded border border-zinc-800 bg-black px-2 py-1.5 text-sm text-white"
        />
      </label>
      {hits.length > 0 ? (
        <ul className="max-h-36 overflow-y-auto rounded border border-zinc-800 bg-zinc-950">
          {hits.map((hit) => (
            <li key={hit.symbol}>
              <button
                type="button"
                onClick={() => pick(hit)}
                className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-zinc-900"
              >
                <span className="font-mono text-white">{hit.symbol}</span>
                <span className="truncate pl-2 text-zinc-500">{hit.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {draft.symbol ? (
        <p className="text-[11px] text-zinc-400">
          {draft.symbol} · {draft.name}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-zinc-500">
          Quantidade
          <input
            value={draft.quantity}
            onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
            inputMode="decimal"
            className="mt-1 w-full rounded border border-zinc-800 bg-black px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="text-[11px] text-zinc-500">
          Preço de compra
          <input
            value={draft.costPrice}
            onChange={(e) => setDraft((d) => ({ ...d, costPrice: e.target.value }))}
            inputMode="decimal"
            className="mt-1 w-full rounded border border-zinc-800 bg-black px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="text-[11px] text-zinc-500">
          Data
          <input
            type="date"
            value={draft.purchasedAt}
            onChange={(e) => setDraft((d) => ({ ...d, purchasedAt: e.target.value }))}
            className="mt-1 w-full rounded border border-zinc-800 bg-black px-2 py-1.5 text-sm text-white"
          />
        </label>
        <span />
        <label className="text-[11px] text-zinc-500">
          Piso (mín.)
          <input
            value={draft.targetMin}
            onChange={(e) => setDraft((d) => ({ ...d, targetMin: e.target.value }))}
            inputMode="decimal"
            placeholder="opcional"
            className="mt-1 w-full rounded border border-zinc-800 bg-black px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="text-[11px] text-zinc-500">
          Teto (máx.)
          <input
            value={draft.targetMax}
            onChange={(e) => setDraft((d) => ({ ...d, targetMax: e.target.value }))}
            inputMode="decimal"
            placeholder="opcional"
            className="mt-1 w-full rounded border border-zinc-800 bg-black px-2 py-1.5 text-sm text-white"
          />
        </label>
      </div>

      {error ? <p className="text-[11px] text-red-400">{error}</p> : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-white px-3 py-1.5 text-xs font-medium text-black disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
