"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { SymbolDetailView } from "@/lib/motor/snapshot-types";
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
import { SymbolKeyStatsPreview, SymbolKeyStats } from "./SymbolKeyStats";
import { SymbolLatestEarnings } from "./SymbolLatestEarnings";
import { SymbolAbout } from "./SymbolAbout";
import {
  MotorIndicatorsTable,
  MotorSignalSummary,
  MotorWhySection,
} from "./MotorTechnicals";
import { TechnicalIndicatorsTable } from "./TechnicalIndicatorsTable";
import { AnalystForecastCard, MotorForecastCard } from "./SymbolForecast";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "financials", label: "Financials" },
  { id: "technicals", label: "Technicals" },
  { id: "forecast", label: "Forecast" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function parseTab(value: string | null): TabId {
  if (value === "financials" || value === "technicals" || value === "forecast") {
    return value;
  }
  return "overview";
}

export function SymbolDetailPanel({ detail }: { detail: SymbolDetailView }) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => parseTab(searchParams.get("tab")));
  const quote = detail.quote;
  const motor = detail.motor;
  const hasMotorData = motor.motorScope !== "none";

  return (
    <div className="space-y-6">
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
                  Motor score {formatScore(motor.score)} · {motor.stageLabel}
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

        <nav className="flex gap-1 border-b border-zinc-800">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm transition-colors ${
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
          <SymbolPriceChart bars={detail.bars} previousClose={quote.previousClose} />
          <SymbolPerfTiles horizons={detail.perfHorizons} />
          <SymbolKeyStatsPreview quote={quote} symbol={detail.symbol} />
        </div>
      ) : null}

      {tab === "financials" ? (
        <div id="financials" className="space-y-8">
          <SymbolKeyStats quote={quote} />
          <SymbolLatestEarnings quote={quote} />
          <SymbolAbout summary={quote.longBusinessSummary} />
        </div>
      ) : null}

      {tab === "technicals" ? (
        <div className="space-y-6">
          <MotorSignalSummary score={motor.score} indicators={motor.indicators} />
          <MotorWhySection
            stageLabel={motor.stageLabel}
            entryValidated={motor.entryValidated}
            hasMotorData={hasMotorData}
            motorScope={motor.motorScope}
            divergesFromClass={motor.divergesFromClass}
            dominantIndicator={motor.dominantIndicator}
            rationale={motor.rationale}
            classLabel={detail.classLabel}
          />
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-white">Motor indicators</h3>
            <MotorIndicatorsTable indicators={motor.indicators} />
          </div>
          <TechnicalIndicatorsTable rows={detail.technicalRows} />
        </div>
      ) : null}

      {tab === "forecast" ? (
        <div className="space-y-6">
          <MotorForecastCard score={motor.score} indicators={motor.indicators} />
          <AnalystForecastCard quote={quote} bars={detail.bars} />
        </div>
      ) : null}

      <p className="text-[11px] text-zinc-600">
        Conteúdo educacional. Não constitui assessoria de investimentos ou recomendação
        personalizada.
      </p>
    </div>
  );
}
