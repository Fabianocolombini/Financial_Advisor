"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { SymbolDetailView } from "@/lib/motor/snapshot-types";
import type { PerfHorizonId } from "@/lib/market/perf-horizons";
import { SymbolAvatar } from "@/components/catalog/SymbolAvatar";
import { MotorDataFreshness } from "@/components/home/MotorDataFreshness";
import {
  formatChangeAbs,
  formatPerf,
  formatPrice,
  perfClass,
} from "@/lib/format-market";
import { formatScore } from "@/lib/motor/format-scores";
import { SymbolPriceChart } from "./SymbolPriceChart";
import { SymbolPerfTiles } from "./SymbolPerfTiles";
import { SymbolOverviewStats } from "./SymbolOverviewStats";
import { SymbolKeyStatsPreview } from "./SymbolKeyStats";
import { SymbolAbout } from "./SymbolAbout";
import { MotorTechnicalsTab } from "./MotorTechnicalsTab";
import { AnalystForecastCard, PriceForecastPanel } from "./SymbolForecast";
import { SymbolReliabilityBanner } from "./SymbolReliabilityBanner";
import { SymbolDataEquationPanel } from "./SymbolDataEquationPanel";
import {
  SymbolEarningsPanel,
  SymbolFinancialsPanel,
} from "./SymbolFinancialsPanel";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "financials", label: "Financials" },
  { id: "motor", label: "Motor & Technicals" },
  { id: "forecast", label: "Forecast" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function parseTab(value: string | null): TabId {
  if (value === "technicals") return "motor";
  if (value === "motor" || value === "financials" || value === "forecast") {
    return value;
  }
  return "overview";
}

export function SymbolDetailPanel({ detail }: { detail: SymbolDetailView }) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => parseTab(searchParams.get("tab")));
  const [chartHorizon, setChartHorizon] = useState<PerfHorizonId>("1m");
  const quote = detail.quote;
  const motor = detail.motor;
  const hasMotorData = motor.motorScope !== "none";

  return (
    <div className="space-y-6">
      <SymbolReliabilityBanner reliability={detail.reliability} />

      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <SymbolAvatar
              symbol={detail.symbol}
              exchange={detail.exchange ?? "NYSE"}
              classId={detail.classId}
              size="lg"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-title text-2xl text-white">{detail.symbol}</h1>
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                  {detail.classLabel}
                </span>
              </div>
              <p className="text-sm text-zinc-500">{detail.name}</p>
              <div className="mt-2 flex flex-wrap items-baseline gap-3">
                <span className="text-2xl font-medium tabular-nums text-white">
                  {formatPrice(quote.price)} {quote.currency ?? "USD"}
                </span>
                {quote.change != null && quote.changePercent != null ? (
                  <span
                    className={`text-sm tabular-nums ${perfClass(quote.changePercent)}`}
                  >
                    {formatChangeAbs(quote.change, quote.currency ?? "USD")} (
                    {formatPerf(quote.changePercent)})
                  </span>
                ) : null}
              </div>
              {hasMotorData ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Ticker {formatScore(motor.score)} · Class {formatScore(motor.classScore)} ·{" "}
                  {motor.stageLabel}
                </p>
              ) : null}
            </div>
          </div>
          {detail.snapshot ? <MotorDataFreshness snapshot={detail.snapshot} /> : null}
        </div>

        {detail.yahooWarning ? (
          <p className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Yahoo: {detail.yahooWarning}
          </p>
        ) : null}

        <nav className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-b-2 border-white text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === "overview" ? (
        <div className="space-y-6">
          <SymbolPriceChart
            bars={detail.bars}
            previousClose={quote.previousClose}
            horizon={chartHorizon}
            onHorizonChange={setChartHorizon}
          />
          <SymbolPerfTiles
            horizons={detail.perfHorizons}
            active={chartHorizon}
            onSelect={setChartHorizon}
          />
          <SymbolOverviewStats
            bars={detail.bars}
            horizons={detail.perfHorizons}
            quote={quote}
          />
          <SymbolDataEquationPanel
            equation={detail.dataEquation}
            classLabel={detail.classLabel}
          />
          <SymbolKeyStatsPreview
            financials={detail.financials}
            symbol={detail.symbol}
          />
        </div>
      ) : null}

      {tab === "motor" ? <MotorTechnicalsTab detail={detail} /> : null}

      {tab === "financials" ? (
        <div id="financials" className="space-y-8">
          <SymbolFinancialsPanel financials={detail.financials} />
          <SymbolEarningsPanel financials={detail.financials} />
          <SymbolAbout summary={detail.financials.longBusinessSummary} />
        </div>
      ) : null}

      {tab === "forecast" ? (
        <div className="space-y-6">
          <PriceForecastPanel forecast={detail.forecast} bars={detail.bars} />
          <AnalystForecastCard quote={quote} />
          <p className="text-xs text-zinc-500">
            A projeção é recalculada a cada carregamento a partir do histórico do Yahoo; a
            leitura de alocação e entrada fica na aba Motor &amp; Technicals.
          </p>
        </div>
      ) : null}

      <p className="text-[11px] text-zinc-600">
        Conteúdo educacional. Não constitui assessoria de investimentos ou recomendação
        personalizada.
      </p>
    </div>
  );
}
