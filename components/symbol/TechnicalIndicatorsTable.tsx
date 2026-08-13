"use client";

import type { TechnicalIndicatorRow } from "@/lib/market/technical-summary";
import { countTaActions } from "@/lib/market/technical-summary";
import { actionClass, formatIndicatorValue } from "@/lib/motor/format-scores";
import { detectMaCross } from "@/lib/motor/motor-technicals-summary";
import { InfoTooltip } from "./InfoTooltip";
import type { GlossaryTerm } from "./InfoTooltip";

function ExcludedNote({
  excluded,
}: {
  excluded: Array<{ row: TechnicalIndicatorRow; reason: string }>;
}) {
  if (excluded.length === 0) return null;
  const reasons = [...new Set(excluded.map((e) => e.reason))];
  return (
    <div className="rounded border border-zinc-800 bg-black/40 px-3 py-2">
      <p className="text-[11px] font-medium text-zinc-400">
        Do not apply to this class ({excluded.length})
      </p>
      <p className="mt-1 text-[11px] text-zinc-600">
        {excluded.map((e) => e.row.name).join(", ")}
      </p>
      {reasons.map((reason) => (
        <p key={reason} className="mt-1 text-[11px] text-zinc-500">
          {reason}
        </p>
      ))}
    </div>
  );
}

function SignalTable({
  title,
  rows,
  price,
  glossary,
  empty,
  excluded,
}: {
  title: string;
  rows: TechnicalIndicatorRow[];
  price?: number | null;
  glossary?: GlossaryTerm;
  empty: string;
  excluded: Array<{ row: TechnicalIndicatorRow; reason: string }>;
}) {
  const counts = countTaActions(rows);
  const showVsPrice = price != null && rows.some((r) => r.group === "moving_average");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="inline-flex items-center gap-1 text-xs font-medium text-zinc-300">
          {title}
          {glossary ? <InfoTooltip term={glossary} /> : null}
        </h4>
        {rows.length > 0 ? (
          <p className="text-[11px] text-zinc-500">
            <span className="text-red-400">Sell {counts.sell}</span>
            {" · "}
            <span className="text-zinc-400">Neutral {counts.neutral}</span>
            {" · "}
            <span className="text-emerald-400">Buy {counts.buy}</span>
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-950 text-[11px] text-zinc-500">
              <tr>
                <th className="px-3 py-2">Indicator</th>
                <th className="px-3 py-2">Value</th>
                {showVsPrice ? <th className="px-3 py-2">Price vs average</th> : null}
                <th className="px-3 py-2">Signal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const vs =
                  showVsPrice && price != null && row.value != null
                    ? price > row.value
                      ? "above"
                      : price < row.value
                        ? "below"
                        : "at average"
                    : null;
                const overbought = row.action === "Sell" && row.group === "oscillator";
                const oversold = row.action === "Buy" && row.group === "oscillator";
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-zinc-800/80 ${
                      overbought
                        ? "border-l-2 border-l-red-500/60"
                        : oversold
                          ? "border-l-2 border-l-emerald-500/60"
                          : ""
                    }`}
                  >
                    <td className="px-3 py-2 text-white">{row.name}</td>
                    <td className="px-3 py-2 tabular-nums text-zinc-300">
                      {formatIndicatorValue(row.value)}
                    </td>
                    {showVsPrice ? (
                      <td className="px-3 py-2 text-zinc-400">{vs ?? "—"}</td>
                    ) : null}
                    <td className={`px-3 py-2 ${actionClass(row.action)}`}>
                      {row.action}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ExcludedNote excluded={excluded} />
    </div>
  );
}

export function TechnicalIndicatorsTable({
  oscillators,
  movingAverages,
  excludedOscillators,
  excludedMovingAverages,
  price,
}: {
  oscillators: TechnicalIndicatorRow[];
  movingAverages: TechnicalIndicatorRow[];
  excludedOscillators: Array<{ row: TechnicalIndicatorRow; reason: string }>;
  excludedMovingAverages: Array<{ row: TechnicalIndicatorRow; reason: string }>;
  price: number | null;
}) {
  const cross = detectMaCross(movingAverages);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-white">Indicators — Buy, Neutral, Sell</h3>
        <p className="text-[11px] text-zinc-600">
          Buy = favors upside · Neutral = no signal now · Sell = favors downside
        </p>
      </div>

      {cross ? (
        <p className="text-xs">
          <span
            className={`rounded px-2 py-0.5 ${
              cross === "golden"
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-red-500/10 text-red-400"
            }`}
          >
            {cross === "golden" ? "Golden cross" : "Death cross"} — MA50 vs MA200
          </span>
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <SignalTable
          title="Oscillators"
          rows={oscillators}
          glossary="rsi"
          empty={
            excludedOscillators.length > 0
              ? "No momentum oscillator applies to this class."
              : "Not enough history for oscillators."
          }
          excluded={excludedOscillators}
        />
        <SignalTable
          title="Moving averages"
          rows={movingAverages}
          price={price}
          glossary="moving_averages"
          empty={
            excludedMovingAverages.length > 0
              ? "No moving average applies to this class."
              : "Not enough history for moving averages."
          }
          excluded={excludedMovingAverages}
        />
      </div>
    </section>
  );
}
