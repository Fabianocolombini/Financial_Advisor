"use client";

import { useMemo, useState } from "react";
import {
  buildPivotTable,
  PIVOT_LEVEL_ORDER,
  PIVOT_METHODS,
  PIVOT_PERIODS,
  pivotTargets,
  type PivotPeriodId,
  type PivotSourceBar,
} from "@/lib/market/pivot-points";

function formatLevel(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function levelTone(level: string): string {
  if (level.startsWith("R")) return "text-red-300";
  if (level.startsWith("S")) return "text-emerald-300";
  return "text-white";
}

export function PivotPointsTable({
  bars,
  price,
}: {
  bars: PivotSourceBar[];
  price: number | null;
}) {
  const [period, setPeriod] = useState<PivotPeriodId>("daily");
  const table = useMemo(() => buildPivotTable(bars, period), [bars, period]);
  const targets = useMemo(
    () => (table && price != null ? pivotTargets(table, price) : null),
    [table, price],
  );

  if (!table) {
    return (
      <p className="text-sm text-zinc-500">
        Histórico insuficiente para calcular pivôs do período anterior.
      </p>
    );
  }

  const periodMeta = PIVOT_PERIODS.find((p) => p.id === period);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-xs text-zinc-500">
          Níveis calculados sobre a máxima, mínima e fechamento do {periodMeta?.caption}
          {" "}({table.source.from === table.source.to
            ? table.source.from
            : `${table.source.from} a ${table.source.to}`}). Ficam fixos até o período
          fechar, por isso servem como alvo definido de antemão.
        </p>
        <div className="flex gap-1 rounded-md border border-zinc-800 bg-zinc-950 p-0.5">
          {PIVOT_PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`rounded px-2.5 py-1 text-[11px] transition-colors ${
                period === p.id
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {targets && (targets.resistance || targets.support) ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded border border-zinc-800 bg-black px-3 py-2">
            <p className="text-[11px] text-zinc-600">Próximo alvo de alta</p>
            <p className="text-sm tabular-nums text-zinc-200">
              {targets.resistance
                ? `${formatLevel(targets.resistance.price)} (${targets.resistance.level}, ${targets.resistance.distancePct >= 0 ? "+" : ""}${targets.resistance.distancePct.toFixed(2)}%)`
                : "acima de todos os níveis projetados"}
            </p>
          </div>
          <div className="rounded border border-zinc-800 bg-black px-3 py-2">
            <p className="text-[11px] text-zinc-600">Próximo suporte</p>
            <p className="text-sm tabular-nums text-zinc-200">
              {targets.support
                ? `${formatLevel(targets.support.price)} (${targets.support.level}, ${targets.support.distancePct.toFixed(2)}%)`
                : "abaixo de todos os níveis projetados"}
            </p>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-950 text-[11px] text-zinc-500">
            <tr>
              <th className="px-3 py-2">Pivô</th>
              {PIVOT_METHODS.map((m) => (
                <th key={m.id} className="px-3 py-2" title={m.description}>
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PIVOT_LEVEL_ORDER.map((level) => (
              <tr
                key={level}
                className={`border-b border-zinc-800/80 ${
                  level === "P" ? "bg-zinc-900/40" : ""
                }`}
              >
                <td className={`px-3 py-2 font-medium ${levelTone(level)}`}>{level}</td>
                {table.sets.map((set) => {
                  const value = set.levels[level];
                  const crossed =
                    price != null && value != null
                      ? level.startsWith("R")
                        ? price > value
                        : level.startsWith("S")
                          ? price < value
                          : false
                      : false;
                  return (
                    <td
                      key={set.method}
                      className={`px-3 py-2 tabular-nums ${
                        crossed ? "text-zinc-600 line-through" : "text-zinc-300"
                      }`}
                      title={crossed ? "Nível já rompido pelo preço atual" : undefined}
                    >
                      {formatLevel(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="rounded border border-zinc-800 bg-black px-3 py-2">
        <summary className="cursor-pointer text-[11px] text-zinc-500">
          Como ler cada método
        </summary>
        <ul className="mt-2 space-y-1.5 text-[11px] text-zinc-500">
          {PIVOT_METHODS.map((m) => (
            <li key={m.id}>
              <span className="text-zinc-300">{m.label}:</span> {m.description}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
