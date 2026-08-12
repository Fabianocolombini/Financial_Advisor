"use client";

import { useEffect, useMemo, useState } from "react";
import type { IndicatorSeries } from "@/lib/market/technical-indicators";
import type { TechnicalIndicatorRow } from "@/lib/market/technical-summary";
import { actionClass, formatIndicatorValue } from "@/lib/motor/format-scores";
import { IndicatorChart, type IndicatorChartBar } from "./IndicatorChart";

const LOOKBACKS = [
  { id: "3m", label: "3M", bars: 63 },
  { id: "6m", label: "6M", bars: 126 },
  { id: "1y", label: "1A", bars: 252 },
  { id: "all", label: "Tudo", bars: Number.POSITIVE_INFINITY },
] as const;

type LookbackId = (typeof LOOKBACKS)[number]["id"];

const SELECTION_STORAGE_KEY = "fa.indicators.selected";
const DEFAULT_SELECTION = ["rsi_14"];

function loadSelection(): string[] {
  if (typeof window === "undefined") return DEFAULT_SELECTION;
  try {
    const raw = sessionStorage.getItem(SELECTION_STORAGE_KEY);
    if (!raw) return DEFAULT_SELECTION;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : DEFAULT_SELECTION;
  } catch {
    return DEFAULT_SELECTION;
  }
}

/** Keep the series aligned with the visible bars when the window is shortened. */
function sliceSeries(series: IndicatorSeries, count: number): IndicatorSeries {
  if (!Number.isFinite(count) || count >= series.values.length) return series;
  return {
    ...series,
    values: series.values.slice(-count),
    lines: series.lines.map((line) => ({ ...line, values: line.values.slice(-count) })),
  };
}

export function IndicatorExplorer({
  series,
  rows,
  bars,
}: {
  series: IndicatorSeries[];
  rows: TechnicalIndicatorRow[];
  bars: IndicatorChartBar[];
}) {
  const [selected, setSelected] = useState<string[]>(() => loadSelection());
  const [lookback, setLookback] = useState<LookbackId>("6m");

  useEffect(() => {
    try {
      sessionStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(selected));
    } catch {
      /* ignore */
    }
  }, [selected]);

  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const available = useMemo(
    () => series.filter((s) => rowById.has(s.id)),
    [series, rowById],
  );

  const count = LOOKBACKS.find((l) => l.id === lookback)?.bars ?? 126;
  const visibleBars = useMemo(
    () => (Number.isFinite(count) ? bars.slice(-count) : bars),
    [bars, count],
  );

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  if (available.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Histórico insuficiente para plotar indicadores.
      </p>
    );
  }

  const oscillators = available.filter((s) => s.group === "oscillator");
  const movingAverages = available.filter((s) => s.group === "moving_average");
  const selectedSeries = selected
    .map((id) => available.find((s) => s.id === id))
    .filter((s): s is IndicatorSeries => s != null);

  const renderGroup = (title: string, group: IndicatorSeries[]) => {
    if (group.length === 0) return null;
    return (
      <div>
        <p className="mb-1.5 text-[11px] uppercase tracking-wide text-zinc-600">{title}</p>
        <div className="flex flex-wrap gap-1.5">
          {group.map((s) => {
            const row = rowById.get(s.id);
            const on = selected.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                aria-pressed={on}
                className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                  on
                    ? "border-sky-500/60 bg-sky-500/10 text-sky-200"
                    : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
                title={`${s.name}${row?.value != null ? ` · ${formatIndicatorValue(row.value)}` : ""}`}
              >
                {s.name}
                {row ? (
                  <span className={`ml-1.5 ${actionClass(row.action)}`}>{row.action}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs text-zinc-500">
          Selecione os indicadores — os gráficos abrem dois por linha, com as faixas de
          referência de cada um.
        </p>
        <div className="flex gap-1 rounded-md border border-zinc-800 bg-zinc-950 p-0.5">
          {LOOKBACKS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLookback(l.id)}
              className={`rounded px-2.5 py-1 text-[11px] transition-colors ${
                lookback === l.id
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        {renderGroup("Osciladores", oscillators)}
        {renderGroup("Médias móveis", movingAverages)}
        {selected.length > 0 ? (
          <button
            type="button"
            onClick={() => setSelected([])}
            className="text-[11px] text-zinc-600 underline-offset-2 hover:text-zinc-400 hover:underline"
          >
            Limpar seleção
          </button>
        ) : null}
      </div>

      {selectedSeries.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-800 px-3 py-6 text-center text-xs text-zinc-600">
          Nenhum indicador selecionado. Clique em um indicador acima para ver seu
          histórico.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {selectedSeries.map((s) => {
            const row = rowById.get(s.id);
            return (
              <div key={s.id} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h5 className="text-sm text-white">{s.name}</h5>
                  {row ? (
                    <p className="text-xs text-zinc-400">
                      <span className="tabular-nums text-zinc-200">
                        {formatIndicatorValue(row.value)}
                      </span>
                      <span className={`ml-2 ${actionClass(row.action)}`}>{row.action}</span>
                    </p>
                  ) : null}
                </div>
                <IndicatorChart
                  series={sliceSeries(s, count)}
                  bars={visibleBars}
                  height={s.pane === "price" ? 180 : 140}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
