"use client";

import type { PerfHorizonId, PerfHorizons } from "@/lib/market/perf-horizons";
import { PERF_HORIZON_LABELS } from "@/lib/market/perf-horizons";
import {
  avgVolume,
  cumulativeReturnSparkline,
  volumeConfirmation,
  type ChartBar,
} from "@/lib/market/chart-overlays";
import { trendFromSparkline } from "@/lib/market/technical-sparklines";
import {
  formatPerf,
  formatShareVolumeCompact,
  perfClass,
} from "@/lib/format-market";
import type { YahooQuoteSummary } from "@/lib/market/yahoo-quote";
import { IndicatorTrend } from "./IndicatorTrend";

const RETURN_ORDER: PerfHorizonId[] = ["1d", "5d", "15d", "1m", "2y"];

export function SymbolOverviewStats({
  bars,
  horizons,
  quote,
}: {
  bars: ChartBar[];
  horizons: PerfHorizons;
  quote: YahooQuoteSummary;
}) {
  const closes = bars.map((b) => b.value);
  const vol = volumeConfirmation(bars, 20);
  const avgVol = avgVolume(bars, 20);
  const returnSpark = cumulativeReturnSparkline(closes, 30);
  const returnTrend = trendFromSparkline(returnSpark);

  const volumeSpark = bars
    .slice(-20)
    .map((b) => b.volume ?? 0)
    .filter((v) => v > 0);
  const volumeTrend = trendFromSparkline(volumeSpark);

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium text-white">Estatísticas</h3>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[11px] text-zinc-500">Volume (dia)</p>
          <p className="mt-1 text-base font-medium tabular-nums text-white">
            {formatShareVolumeCompact(vol.latestVolume)}
          </p>
          <div className="mt-2">
            <IndicatorTrend
              sparklineData={volumeSpark}
              direction={volumeTrend.direction}
              delta={volumeTrend.delta}
              deltaPct={volumeTrend.deltaPct}
              compact
            />
          </div>
          <p className="mt-1 text-[10px] text-zinc-600">
            Média 20D: {formatShareVolumeCompact(avgVol)}
          </p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[11px] text-zinc-500">Dividend yield</p>
          <p className="mt-1 text-base font-medium tabular-nums text-white">
            {quote.dividendYield != null
              ? `${(quote.dividendYield * 100).toFixed(2)}%`
              : "—"}
          </p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 sm:col-span-2">
          <p className="text-[11px] text-zinc-500">Retornos acumulados</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {RETURN_ORDER.map((id) => {
              const pct = horizons[id];
              return (
                <div key={id} className="min-w-[4rem]">
                  <p className="text-[10px] text-zinc-600">{PERF_HORIZON_LABELS[id]}</p>
                  <p className={`text-sm font-medium tabular-nums ${perfClass(pct)}`}>
                    {formatPerf(pct)}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-3">
            <IndicatorTrend
              sparklineData={returnSpark}
              direction={returnTrend.direction}
              delta={returnTrend.delta}
              deltaPct={returnTrend.deltaPct}
              value="tendência"
            />
          </div>
        </div>
      </div>

      {vol.message ? (
        <p
          className={`text-xs ${
            (vol.vsAvgPct ?? 0) >= 20
              ? "text-emerald-400"
              : (vol.vsAvgPct ?? 0) <= -20
                ? "text-zinc-500"
                : "text-zinc-400"
          }`}
        >
          {vol.message}
        </p>
      ) : null}
    </section>
  );
}
