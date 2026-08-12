"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CatalogSearchResult } from "@/lib/catalog/types";
import { formatPrice } from "@/lib/format-market";
import { formatBandPrice, type SuggestedBands } from "@/lib/wallet/suggested-bands";

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

function fieldClass() {
  return "mt-1 w-full rounded border border-zinc-800 bg-black px-2 py-1.5 text-sm text-white";
}

export function WalletHoldingForm({
  initial,
  lastPrice,
  onSaved,
  onCancel,
}: {
  initial?: Partial<HoldingDraft>;
  lastPrice?: number | null;
  onSaved: (symbol: string) => void;
  onCancel: () => void;
}) {
  const locked = Boolean(initial?.symbol);
  const [draft, setDraft] = useState<HoldingDraft>({ ...emptyDraft(), ...initial });
  const [query, setQuery] = useState(initial?.symbol ?? "");
  const [hits, setHits] = useState<CatalogSearchResult[]>([]);
  const [bands, setBands] = useState<SuggestedBands | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (locked) return;
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
  }, [query, locked]);

  useEffect(() => {
    if (!draft.symbol || !draft.classId) return;
    let cancelled = false;
    fetch(
      `/api/wallet/bands?symbol=${encodeURIComponent(draft.symbol)}&classId=${encodeURIComponent(draft.classId)}`,
    )
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { data: SuggestedBands };
      })
      .then((json) => {
        if (cancelled || !json?.data) return;
        setBands(json.data);
        setDraft((d) => {
          const next = { ...d };
          const last = json.data.last ?? lastPrice ?? null;
          if (!next.costPrice && last != null) next.costPrice = formatBandPrice(last);
          if (!next.targetMin && json.data.floor) {
            next.targetMin = formatBandPrice(json.data.floor.price);
          }
          if (!next.targetMax && json.data.ceiling) {
            next.targetMax = formatBandPrice(json.data.ceiling.price);
          }
          return next;
        });
      })
      .catch(() => {
        /* bands are a hint, not a blocker */
      });
    return () => {
      cancelled = true;
    };
  }, [draft.symbol, draft.classId, lastPrice]);

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

  const qty = Number(draft.quantity);
  const unit = Number(draft.costPrice);
  const total =
    Number.isFinite(qty) && qty > 0 && Number.isFinite(unit) && unit > 0
      ? qty * unit
      : null;

  const resistances = useMemo(() => bands?.resistances ?? [], [bands]);

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
      onSaved(draft.symbol);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {locked ? (
        <div className="flex items-baseline gap-2 border-b border-zinc-800 pb-2">
          <span className="font-mono text-base font-medium text-white">{draft.symbol}</span>
          <span className="min-w-0 truncate text-[11px] text-zinc-400">{draft.name}</span>
        </div>
      ) : (
        <>
          <label className="block text-[11px] leading-4 text-zinc-400">
            Papel
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setDraft((d) => ({ ...d, symbol: "", classId: "", name: "" }));
                setBands(null);
              }}
              placeholder="SGOV, SPY…"
              className={fieldClass()}
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
            <p className="font-mono text-sm text-white">
              {draft.symbol}{" "}
              <span className="font-sans text-[11px] text-zinc-400">{draft.name}</span>
            </p>
          ) : null}
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] leading-4 text-zinc-400">
          Quantidade
          <input
            value={draft.quantity}
            onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
            inputMode="decimal"
            className={fieldClass()}
          />
        </label>
        <label className="block text-[11px] leading-4 text-zinc-400">
          Preço de compra
          <input
            value={draft.costPrice}
            onChange={(e) => setDraft((d) => ({ ...d, costPrice: e.target.value }))}
            inputMode="decimal"
            className={fieldClass()}
          />
        </label>
      </div>

      {total != null ? (
        <p className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-[11px] text-zinc-300">
          Total da compra{" "}
          <span className="font-medium tabular-nums text-white">{formatPrice(total)}</span>
        </p>
      ) : (
        <p className="text-[11px] text-zinc-600">Informe a quantidade para ver o total.</p>
      )}

      <label className="block text-[11px] leading-4 text-zinc-400">
        Data
        <input
          type="date"
          value={draft.purchasedAt}
          onChange={(e) => setDraft((d) => ({ ...d, purchasedAt: e.target.value }))}
          className={fieldClass()}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] leading-4 text-zinc-400">
          Piso — próximo suporte
          <input
            value={draft.targetMin}
            onChange={(e) => setDraft((d) => ({ ...d, targetMin: e.target.value }))}
            inputMode="decimal"
            placeholder="próximo piso"
            className={fieldClass()}
          />
        </label>
        <label className="block text-[11px] leading-4 text-zinc-400">
          Teto — próxima resistência
          <input
            value={draft.targetMax}
            onChange={(e) => setDraft((d) => ({ ...d, targetMax: e.target.value }))}
            inputMode="decimal"
            placeholder="próximo teto"
            className={fieldClass()}
          />
        </label>
      </div>

      {resistances.length > 0 ? (
        <div className="rounded border border-zinc-800 px-2 py-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            3 resistências à frente
          </p>
          <ol className="mt-1 space-y-0.5">
            {resistances.map((row, i) => (
              <li
                key={`${row.price}-${row.source}`}
                className="flex items-baseline justify-between gap-2 text-[11px]"
              >
                <span className="text-zinc-500">R{i + 1}</span>
                <button
                  type="button"
                  className="tabular-nums text-zinc-200 hover:text-white"
                  onClick={() =>
                    setDraft((d) => ({ ...d, targetMax: formatBandPrice(row.price) }))
                  }
                >
                  {formatBandPrice(row.price)}
                </button>
                <span className="min-w-0 truncate text-right text-[10px] text-zinc-600">
                  {row.source}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {bands?.floor ? (
        <p className="text-[10px] text-zinc-500">
          Piso sugerido: {formatBandPrice(bands.floor.price)} · {bands.floor.source}
        </p>
      ) : null}
      {bands?.note ? <p className="text-[10px] leading-4 text-zinc-500">{bands.note}</p> : null}

      {error ? <p className="text-[11px] text-red-400">{error}</p> : null}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-white px-3 py-1.5 text-xs font-medium text-black disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar e acompanhar"}
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
