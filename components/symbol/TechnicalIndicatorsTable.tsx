import type { TechnicalIndicatorRow } from "@/lib/market/technical-summary";
import { actionClass } from "@/lib/motor/format-scores";
import { formatIndicatorValue } from "@/lib/motor/format-scores";
import { countTaActions } from "@/lib/market/technical-summary";

function TaTable({ title, rows }: { title: string; rows: TechnicalIndicatorRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-zinc-400">{title}</h4>
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-950 text-[11px] text-zinc-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-zinc-800/80">
                <td className="px-3 py-2 text-white">{row.name}</td>
                <td className="px-3 py-2 tabular-nums text-zinc-300">
                  {formatIndicatorValue(row.value)}
                </td>
                <td className={`px-3 py-2 ${actionClass(row.action)}`}>{row.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TechnicalIndicatorsTable({ rows }: { rows: TechnicalIndicatorRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Histórico insuficiente para indicadores técnicos genéricos.
      </p>
    );
  }

  const oscillators = rows.filter((r) => r.group === "oscillator");
  const moving = rows.filter((r) => r.group === "moving_average");
  const counts = countTaActions(rows);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-white">Generic technicals (Yahoo bars)</h3>
        <p className="text-xs text-zinc-500">
          Sell {counts.sell} · Neutral {counts.neutral} · Buy {counts.buy}
        </p>
      </div>
      <p className="text-xs text-zinc-500">
        Regras clássicas (RSI, Stochastic, MACD, preço vs MA) — separadas do score do motor.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <TaTable title="Oscillators" rows={oscillators} />
        <TaTable title="Moving averages" rows={moving} />
      </div>
    </section>
  );
}
