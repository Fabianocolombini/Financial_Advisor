"use client";

import { useState, type ReactNode } from "react";
import type { SymbolDetailView } from "@/lib/motor/snapshot-types";
import type { TechnicalIndicatorRow } from "@/lib/market/technical-summary";
import { countTaActions } from "@/lib/market/technical-summary";
import {
  technicalSparklines,
  trendFromSparkline,
} from "@/lib/market/technical-sparklines";
import {
  actionClass,
  formatIndicatorValue,
  indicatorActionFromContribution,
} from "@/lib/motor/format-scores";
import {
  buildConvergenceSummary,
  detectMaCross,
  glossaryTermForIndicator,
  macroIndicators,
  macroLayerSignal,
  motorLayerCounts,
  scoreToConvergence,
  technicalConvergenceSignal,
} from "@/lib/motor/motor-technicals-summary";
import {
  buildDecisionNarrative,
  buildDecisionSummary,
} from "@/lib/motor/decision-summary";
import { gaugeScaleForClass } from "@/lib/motor/gauge-zones";
import { applicableTechnicalRows } from "@/lib/market/indicator-applicability";
import { ConvergenceCard } from "./ConvergenceCard";
import { DecisionNarrative, DecisionSummaryCards } from "./DecisionSummaryCards";
import { IndicatorTrend } from "./IndicatorTrend";
import { InfoTooltip } from "./InfoTooltip";
import type { GlossaryTerm } from "./InfoTooltip";
import { MotorWhySection } from "./MotorTechnicals";
import { SignalCountCard } from "./SignalCountCard";
import { SymbolClassRegimeModelPanel } from "./SymbolClassRegimeModelPanel";
import { SymbolModelsPanel } from "./SymbolModelsPanel";
import { TechnicalRatingGauge } from "./TechnicalRatingGauge";
import { formatScore } from "@/lib/motor/format-scores";

type ExpandId = "motor" | "oscillators" | "moving_averages" | "macro" | null;

function ExcludedIndicatorsNote({
  excluded,
}: {
  excluded: Array<{ row: TechnicalIndicatorRow; reason: string }>;
}) {
  if (excluded.length === 0) return null;
  const reasons = [...new Set(excluded.map((e) => e.reason))];
  return (
    <div className="rounded border border-zinc-800 bg-black/40 px-3 py-2">
      <p className="text-[11px] font-medium text-zinc-400">
        Indicadores não aplicáveis a esta classe ({excluded.length})
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

function OscillatorsDetail({
  rows,
  bars,
  excluded,
}: {
  rows: TechnicalIndicatorRow[];
  bars: Array<{ date: string; value: number }>;
  excluded: Array<{ row: TechnicalIndicatorRow; reason: string }>;
}) {
  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-500">
          {excluded.length > 0
            ? "Nenhum oscilador de momentum se aplica a esta classe de ativo."
            : "Histórico insuficiente para osciladores técnicos."}
        </p>
        <ExcludedIndicatorsNote excluded={excluded} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-800 bg-zinc-950 text-[11px] text-zinc-500">
          <tr>
            <th className="px-3 py-2">Indicador</th>
            <th className="px-3 py-2">Valor</th>
            <th className="px-3 py-2">Sinal</th>
            <th className="px-3 py-2">Evolução</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const spark = technicalSparklines(bars, row.id);
            const trend = trendFromSparkline(spark);
            const glossary = glossaryTermForIndicator(row.id) as GlossaryTerm | null;
            const overbought =
              row.action === "Sell" && row.group === "oscillator";
            const oversold =
              row.action === "Buy" && row.group === "oscillator";

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
                <td className="px-3 py-2 text-white">
                  <span className="inline-flex items-center gap-1">
                    {row.name}
                    {glossary ? <InfoTooltip term={glossary} /> : null}
                  </span>
                </td>
                <td className="px-3 py-2 tabular-nums text-zinc-300">
                  {formatIndicatorValue(row.value)}
                </td>
                <td className={`px-3 py-2 ${actionClass(row.action)}`}>
                  {row.action}
                  {overbought ? " (overbought)" : oversold ? " (oversold)" : ""}
                </td>
                <td className="px-3 py-2">
                  <IndicatorTrend
                    sparklineData={spark}
                    direction={trend.direction}
                    delta={trend.delta}
                    deltaPct={trend.deltaPct}
                    compact
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <ExcludedIndicatorsNote excluded={excluded} />
    </div>
  );
}

function MovingAveragesDetail({
  rows,
  price,
  excluded,
}: {
  rows: TechnicalIndicatorRow[];
  price: number | null;
  excluded: Array<{ row: TechnicalIndicatorRow; reason: string }>;
}) {
  const display = rows.filter((r) => r.id.startsWith("sma_"));
  const cross = detectMaCross(rows);

  if (display.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-500">Médias móveis indisponíveis.</p>
        <ExcludedIndicatorsNote excluded={excluded} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {cross ? (
        <p className="text-xs">
          <span
            className={`rounded px-2 py-0.5 ${
              cross === "golden"
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-red-500/10 text-red-400"
            }`}
          >
            {cross === "golden" ? "Golden cross" : "Death cross"} — MM50 vs MM200
          </span>
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-950 text-[11px] text-zinc-500">
            <tr>
              <th className="px-3 py-2">Média</th>
              <th className="px-3 py-2">Valor</th>
              <th className="px-3 py-2">Preço vs média</th>
              <th className="px-3 py-2">Sinal</th>
            </tr>
          </thead>
          <tbody>
            {display.map((row) => {
              const vs =
                price != null && row.value != null
                  ? price > row.value
                    ? "acima"
                    : price < row.value
                      ? "abaixo"
                      : "na média"
                  : "—";
              return (
                <tr key={row.id} className="border-b border-zinc-800/80">
                  <td className="px-3 py-2 text-white">
                    <span className="inline-flex items-center gap-1">
                      {row.name.replace("Simple Moving Average", "MM")}
                      <InfoTooltip term="moving_averages" />
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-300">
                    {formatIndicatorValue(row.value)}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{vs}</td>
                  <td className={`px-3 py-2 ${actionClass(row.action)}`}>
                    {row.action}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ExcludedIndicatorsNote excluded={excluded} />
    </div>
  );
}

function MotorQuantDetail({
  detail,
}: {
  detail: SymbolDetailView;
}) {
  const { motor, classLabel } = detail;
  const hasMotor = motor.motorScope !== "none";
  const tickerScore = motor.score;
  const classScore = motor.classScore;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
          <p className="inline-flex items-center gap-1 text-xs text-zinc-500">
            Score do ativo vs média da classe
            <InfoTooltip term="global_motor_models" />
          </p>
          <p className="mt-1 text-lg tabular-nums text-white">
            {formatScore(tickerScore)}{" "}
            <span className="text-sm text-zinc-500">vs {formatScore(classScore)}</span>
          </p>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
          <p className="inline-flex items-center gap-1 text-xs text-zinc-500">
            Class Composition Score
            <InfoTooltip term="class_composition_score" />
          </p>
          <p className="mt-1 text-lg tabular-nums text-white">
            {formatScore(classScore)}
          </p>
          <p className="text-[10px] text-zinc-600">{classLabel}</p>
        </div>
      </div>

      <MotorWhySection
        stageLabel={motor.stageLabel}
        entryValidated={motor.entryValidated}
        hasMotorData={hasMotor}
        motorScope={motor.motorScope}
        divergesFromClass={motor.divergesFromClass}
        dominantIndicator={motor.dominantIndicator}
        rationale={motor.rationale}
        classLabel={classLabel}
      />

      {motor.tickerIndicators.length > 0 ? (
        <MotorIndicatorsCompact
          title="Security — indicadores"
          indicators={motor.tickerIndicators}
        />
      ) : null}
      {motor.classIndicators.length > 0 ? (
        <MotorIndicatorsCompact
          title="Sleeve — indicadores"
          indicators={motor.classIndicators}
        />
      ) : null}
    </div>
  );
}

function MotorIndicatorsCompact({
  title,
  indicators,
}: {
  title: string;
  indicators: SymbolDetailView["motor"]["classIndicators"];
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-zinc-400">{title}</h4>
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-950 text-[11px] text-zinc-500">
            <tr>
              <th className="px-3 py-2">Indicador</th>
              <th className="px-3 py-2">Valor</th>
              <th className="px-3 py-2">Sinal</th>
              <th className="px-3 py-2">Contrib.</th>
            </tr>
          </thead>
          <tbody>
            {indicators.map((ind) => {
              const action = indicatorActionFromContribution(ind.contribution);
              return (
                <tr key={ind.id} className="border-b border-zinc-800/80">
                  <td className="px-3 py-2 text-white">
                    {ind.name}
                    {ind.isProxy ? (
                      <span className="ml-1 text-[10px] text-amber-400">proxy</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-300">
                    {formatIndicatorValue(ind.value)}
                  </td>
                  <td className={`px-3 py-2 ${actionClass(action)}`}>{action}</td>
                  <td className="px-3 py-2 tabular-nums text-zinc-400">
                    {ind.contribution != null ? ind.contribution.toFixed(3) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MacroRiskDetail({ detail }: { detail: SymbolDetailView }) {
  const { motor, snapshot } = detail;
  const macroInds = macroIndicators(motor.classIndicators);

  return (
    <div className="space-y-4">
      {motor.classSnap ? (
        <SymbolClassRegimeModelPanel
          regimeModel={motor.classSnap.regimeModel}
          classId={motor.classId}
        />
      ) : (
        <p className="text-sm text-zinc-500">Regime da classe indisponível.</p>
      )}
      <SymbolModelsPanel models={snapshot?.models} />
      {macroInds.length > 0 ? (
        <div className="space-y-2">
          <h4 className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400">
            Macro / curva / spreads
            <InfoTooltip term="macro_risk" />
          </h4>
          <ul className="space-y-1 text-sm">
            {macroInds.map((ind) => (
              <li
                key={ind.id}
                className="flex flex-wrap items-center gap-2 rounded border border-zinc-800/80 px-3 py-2"
              >
                <span className="text-zinc-300">{ind.name}</span>
                <span className="tabular-nums text-white">
                  {formatIndicatorValue(ind.value)}
                </span>
                {(ind.id.includes("spread") || ind.name.toLowerCase().includes("spread")) && (
                  <InfoTooltip term="fred_10y_spread" />
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function AccordionPanel({
  id,
  title,
  expanded,
  children,
}: {
  id: ExpandId;
  title: string;
  expanded: ExpandId;
  children: ReactNode;
}) {
  if (expanded !== id) return null;
  return (
    <section className="rounded-lg border border-zinc-800 bg-black p-4">
      <h4 className="mb-3 text-sm font-medium text-white">{title}</h4>
      {children}
    </section>
  );
}

export function MotorTechnicalsTab({ detail }: { detail: SymbolDetailView }) {
  const [expanded, setExpanded] = useState<ExpandId>(null);
  const { motor, technicalRows, reliability, quote, classId, classLabel } = detail;

  const applicability = applicableTechnicalRows(technicalRows, classId);
  const applicableRows = applicability.rows;
  const oscillators = applicableRows.filter((r) => r.group === "oscillator");
  const movingAvgs = applicableRows.filter((r) => r.group === "moving_average");
  const excludedOscillators = applicability.excluded.filter(
    (e) => e.row.group === "oscillator",
  );
  const excludedMovingAvgs = applicability.excluded.filter(
    (e) => e.row.group === "moving_average",
  );
  const oscCounts = countTaActions(oscillators);
  const maCounts = countTaActions(movingAvgs);
  const { motor: motorSignal } = motorLayerCounts(motor);
  const macroSignal = macroLayerSignal(motor);

  const decision = buildDecisionSummary({
    motor,
    classId,
    bars: detail.bars,
    price: quote.price ?? null,
    technicalRows,
  });
  const narrative = buildDecisionNarrative(decision, {
    classLabel,
    symbol: detail.symbol,
    entryValidated: motor.entryValidated,
  });

  const motorConv = scoreToConvergence(motor.score, classId);
  const techConv = technicalConvergenceSignal(applicableRows);
  const summary = buildConvergenceSummary(
    motorConv,
    techConv,
    motor.entryValidated,
  );

  const toggle = (id: ExpandId) => setExpanded((cur) => (cur === id ? null : id));

  const hasMotor = motor.motorScope !== "none";
  const confidence = reliability.score;
  const gaugeScale = gaugeScaleForClass(classId);

  return (
    <div className="space-y-6">
      {!hasMotor ? (
        <p className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Dados do motor indisponíveis para este ativo — exibindo apenas técnica genérica
          (Yahoo). Aguarde Motor Daily ou scoring on-demand.
        </p>
      ) : null}

      <DecisionSummaryCards decision={decision} classLabel={classLabel} />

      <TechnicalRatingGauge
        scale={gaugeScale}
        value={decision.gauge.value}
        confidence={confidence}
        caption={`Alocação da classe: ${decision.allocation.label} · Entrada: ${decision.entry.label}`}
        summary={summary}
      />

      <DecisionNarrative sections={narrative} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SignalCountCard
          label="Motor"
          dominantSignal={motorSignal}
          weight="40%"
          expanded={expanded === "motor"}
          onExpand={() => toggle("motor")}
        />
        <SignalCountCard
          label="Oscillators"
          counts={oscCounts}
          expanded={expanded === "oscillators"}
          onExpand={() => toggle("oscillators")}
        />
        <SignalCountCard
          label="Moving Avgs"
          counts={maCounts}
          expanded={expanded === "moving_averages"}
          onExpand={() => toggle("moving_averages")}
        />
        <SignalCountCard
          label="Macro/Risco"
          dominantSignal={macroSignal}
          weight="15%"
          expanded={expanded === "macro"}
          onExpand={() => toggle("macro")}
        />
      </div>

      <AccordionPanel id="motor" title="Motor quantitativo" expanded={expanded}>
        <MotorQuantDetail detail={detail} />
      </AccordionPanel>
      <AccordionPanel id="oscillators" title="Oscillators" expanded={expanded}>
        <OscillatorsDetail
          rows={oscillators}
          bars={detail.bars}
          excluded={excludedOscillators}
        />
      </AccordionPanel>
      <AccordionPanel
        id="moving_averages"
        title="Moving averages"
        expanded={expanded}
      >
        <MovingAveragesDetail
          rows={movingAvgs}
          price={quote.price ?? null}
          excluded={excludedMovingAvgs}
        />
      </AccordionPanel>
      <AccordionPanel id="macro" title="Macro / Risco" expanded={expanded}>
        <MacroRiskDetail detail={detail} />
      </AccordionPanel>

      <ConvergenceCard
        motorSignal={motorConv}
        technicalSignal={techConv}
        motorCaption={
          decision.scoreDomain === "unit"
            ? "Ranking do papel dentro da classe (percentil 0–1), comparado às faixas do próprio modelo."
            : "Score composto direcional do motor."
        }
        technicalCaption={
          applicability.excluded.length > 0
            ? `Calculada apenas sobre os ${applicableRows.length} indicadores aplicáveis a esta classe.`
            : `Calculada sobre ${applicableRows.length} indicadores de preço (informativo, fonte Yahoo).`
        }
      />
    </div>
  );
}
