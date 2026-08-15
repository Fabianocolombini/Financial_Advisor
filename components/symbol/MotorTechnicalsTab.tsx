"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { SymbolDetailView } from "@/lib/motor/snapshot-types";
import {
  countTaActions,
  countsToSignedGauge,
} from "@/lib/market/technical-summary";
import { computeIndicatorSeries } from "@/lib/market/technical-indicators";
import {
  actionClass,
  formatIndicatorValue,
  indicatorActionFromContribution,
} from "@/lib/motor/format-scores";
import {
  buildConvergenceSummary,
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
import {
  gaugeScaleForClass,
  technicalSignalScale,
} from "@/lib/motor/gauge-zones";
import {
  applicableTechnicalRows,
  pivotsApplicable,
} from "@/lib/market/indicator-applicability";
import { ConvergenceCard } from "./ConvergenceCard";
import { DecisionNarrative, DecisionSummaryCards } from "./DecisionSummaryCards";
import { IndicatorExplorer } from "./IndicatorExplorer";
import { PivotPointsTable } from "./PivotPointsTable";
import { IndicatorNameWithInfo, InfoTooltip } from "./InfoTooltip";
import { MotorWhySection } from "./MotorTechnicals";
import { SignalCountCard } from "./SignalCountCard";
import { SymbolClassRegimeModelPanel } from "./SymbolClassRegimeModelPanel";
import { SymbolModelsPanel } from "./SymbolModelsPanel";
import { TechnicalIndicatorsTable } from "./TechnicalIndicatorsTable";
import { TechnicalRatingGauge } from "./TechnicalRatingGauge";
import { formatScore } from "@/lib/motor/format-scores";

type ExpandId = "motor" | "macro" | "pivots" | "charts" | null;

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
            Name score vs class average
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
          title="Security — indicators"
          indicators={motor.tickerIndicators}
        />
      ) : null}
      {motor.classIndicators.length > 0 ? (
        <MotorIndicatorsCompact
          title="Sleeve — indicators"
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
              <th className="px-3 py-2">Indicator</th>
              <th className="px-3 py-2">
                <span className="inline-flex items-center gap-1">
                  Value
                  <InfoTooltip term="motor_col_value" />
                </span>
              </th>
              <th className="px-3 py-2">
                <span className="inline-flex items-center gap-1">
                  Signal
                  <InfoTooltip term="motor_col_action" />
                </span>
              </th>
              <th className="px-3 py-2">
                <span className="inline-flex items-center gap-1">
                  Contrib.
                  <InfoTooltip term="motor_col_contribution" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {indicators.map((ind) => {
              const action = indicatorActionFromContribution(ind.contribution);
              return (
                <tr key={ind.id} className="border-b border-zinc-800/80">
                  <td className="px-3 py-2 text-white">
                    <IndicatorNameWithInfo
                      id={ind.id}
                      name={ind.name}
                      extra={
                        ind.isProxy ? (
                          <span className="text-[10px] text-amber-400">proxy</span>
                        ) : null
                      }
                    />
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
        <p className="text-sm text-zinc-500">Class regime unavailable.</p>
      )}
      <SymbolModelsPanel models={snapshot?.models} />
      {macroInds.length > 0 ? (
        <div className="space-y-2">
          <h4 className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400">
            Macro / curve / spreads
            <InfoTooltip term="macro_risk" />
          </h4>
          <ul className="space-y-1 text-sm">
            {macroInds.map((ind) => (
              <li
                key={ind.id}
                className="flex flex-wrap items-center gap-2 rounded border border-zinc-800/80 px-3 py-2"
              >
                <IndicatorNameWithInfo id={ind.id} name={ind.name} />
                <span className="tabular-nums text-white">
                  {formatIndicatorValue(ind.value)}
                </span>
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

  // Recomputed from the bars already shipped to the client, so the charts and the
  // table read the same numbers without shipping 26 full series in the payload.
  const series = useMemo(() => computeIndicatorSeries(detail.bars), [detail.bars]);

  const applicability = applicableTechnicalRows(technicalRows, classId);
  const applicableRows = applicability.rows;
  const pivots = pivotsApplicable(classId);
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
  const oscGauge = oscillators.length > 0 ? countsToSignedGauge(oscCounts) : null;
  const maGauge = movingAvgs.length > 0 ? countsToSignedGauge(maCounts) : null;

  return (
    <div className="space-y-6">
      {!hasMotor ? (
        <p className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Motor data is unavailable for this name — showing generic technicals
          only (Yahoo). Wait for Motor Daily or on-demand scoring.
        </p>
      ) : null}

      <DecisionSummaryCards decision={decision} classLabel={classLabel} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-3">
          <TechnicalRatingGauge
            scale={gaugeScale}
            value={decision.gauge.value}
            confidence={confidence}
            caption={`Class allocation: ${decision.allocation.label} · Entry: ${decision.entry.label}`}
            summary={summary}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TechnicalRatingGauge
              scale={technicalSignalScale(
                "Oscillators",
                "Consensus clock among the oscillators. It is not the motor ranking.",
              )}
              value={oscGauge}
              compact
              showConfidence={false}
              emptyLabel="Does not apply"
              caption={
                oscillators.length > 0
                  ? `Sell ${oscCounts.sell} · Neutral ${oscCounts.neutral} · Buy ${oscCounts.buy}`
                  : undefined
              }
            />
            <TechnicalRatingGauge
              scale={technicalSignalScale(
                "Moving averages",
                "Consensus clock among the averages. Price above the average = Buy.",
              )}
              value={maGauge}
              compact
              showConfidence={false}
              emptyLabel="Does not apply"
              caption={
                movingAvgs.length > 0
                  ? `Sell ${maCounts.sell} · Neutral ${maCounts.neutral} · Buy ${maCounts.buy}`
                  : undefined
              }
            />
          </div>
        </div>
        <DecisionNarrative sections={narrative} />
      </div>

      <TechnicalIndicatorsTable
        oscillators={oscillators}
        movingAverages={movingAvgs}
        excludedOscillators={excludedOscillators}
        excludedMovingAverages={excludedMovingAvgs}
        price={quote.price ?? null}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <SignalCountCard
          label="Motor"
          dominantSignal={motorSignal}
          weight="40%"
          expanded={expanded === "motor"}
          onExpand={() => toggle("motor")}
        />
        <SignalCountCard
          label="Macro/Risk"
          dominantSignal={macroSignal}
          weight="15%"
          expanded={expanded === "macro"}
          onExpand={() => toggle("macro")}
        />
      </div>

      <AccordionPanel id="motor" title="Quantitative motor" expanded={expanded}>
        <MotorQuantDetail detail={detail} />
      </AccordionPanel>
      <AccordionPanel id="macro" title="Macro / Risk" expanded={expanded}>
        <MacroRiskDetail detail={detail} />
      </AccordionPanel>

      <section className="rounded-lg border border-zinc-800 bg-black p-4">
        <button
          type="button"
          onClick={() => toggle("pivots")}
          aria-expanded={expanded === "pivots"}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-white">
            Pivots and targets
            <InfoTooltip term="pivot_points" />
          </span>
          <span className="text-xs text-zinc-500">
            {expanded === "pivots" ? "Hide" : "Show"}
          </span>
        </button>
        {expanded === "pivots" ? (
          <div className="mt-3">
            {pivots.applicable ? (
              <PivotPointsTable bars={detail.bars} price={quote.price ?? null} />
            ) : (
              <p className="text-sm text-zinc-500">{pivots.reason}</p>
            )}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-black p-4">
        <button
          type="button"
          onClick={() => toggle("charts")}
          aria-expanded={expanded === "charts"}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="text-sm font-medium text-white">
            Charts by indicator
          </span>
          <span className="text-xs text-zinc-500">
            {expanded === "charts" ? "Hide" : "Show"}
          </span>
        </button>
        {expanded === "charts" ? (
          <div className="mt-3">
            <IndicatorExplorer
              series={series}
              rows={applicableRows}
              bars={detail.bars}
            />
          </div>
        ) : null}
      </section>

      <ConvergenceCard
        motorSignal={motorConv}
        technicalSignal={techConv}
        motorCaption={
          decision.scoreDomain === "unit"
            ? "Ranking of the name inside the class (0–1 percentile), compared with the model's own bands."
            : "Motor directional composite score."
        }
        technicalCaption={
          applicability.excluded.length > 0
            ? `Calculated only on the ${applicableRows.length} indicators that apply to this class.`
            : `Calculated on ${applicableRows.length} price indicators (informational, Yahoo source).`
        }
      />
    </div>
  );
}
