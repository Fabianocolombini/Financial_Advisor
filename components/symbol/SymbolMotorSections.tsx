import type { SymbolMotorContext } from "@/lib/motor/snapshot-types";
import { formatScore } from "@/lib/motor/format-scores";
import { stageBadgeClass, entryBadgeClass } from "@/lib/motor/format-scores";
import { MotorIndicatorsTable } from "./MotorTechnicals";
import { SymbolCashModelPanel } from "./SymbolCashModelPanel";
import { SymbolScoreHistoryChart } from "./SymbolScoreHistoryChart";
import { IndicatorFredChart } from "./IndicatorFredChart";

export function ClassMacroSection({
  motor,
  classLabel,
}: {
  motor: SymbolMotorContext;
  classLabel: string;
}) {
  const snap = motor.classSnap;
  if (!motor.hasClassMotor || !snap) {
    return (
      <p className="text-sm text-zinc-500">Macro da classe {classLabel} pendente no snapshot.</p>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-medium text-white">Sleeve macro — {classLabel}</h3>
        <span className="text-xs text-zinc-400">Score {formatScore(snap.score)}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${stageBadgeClass(
            snap.stageLabel,
          )}`}
        >
          {snap.stageLabel}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${entryBadgeClass(
            snap.entryValidated ?? false,
            true,
          )}`}
        >
          {snap.entryValidated ? "Entry validated" : "Entry not validated"}
        </span>
      </div>
      {snap.dominantIndicator ? (
        <p className="text-xs text-zinc-500">
          Driver: {snap.dominantIndicator.name}
          {snap.dominantIndicator.contribution != null
            ? ` (${snap.dominantIndicator.contribution.toFixed(3)})`
            : ""}
        </p>
      ) : null}
      {motor.classRationale.length > 0 ? (
        <ul className="text-xs text-zinc-400">
          {motor.classRationale.map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      ) : null}
      <SymbolCashModelPanel
        regimeModel={snap.regimeModel}
        classId={motor.classId ?? snap.classId}
      />
      <MotorIndicatorsTable indicators={motor.classIndicators} title="All class indicators" />
      <SymbolScoreHistoryChart
        title="Class composite score (historico)"
        points={motor.classScoreHistory}
        color="#38bdf8"
      />
      {snap.dominantIndicator ? (
        <IndicatorFredChart
          indicatorId={snap.dominantIndicator.id}
          indicatorName={snap.dominantIndicator.name}
        />
      ) : null}
    </section>
  );
}

export function TickerMotorSection({ motor }: { motor: SymbolMotorContext }) {
  if (!motor.hasTickerMotor || !motor.ticker) {
    return (
      <p className="text-sm text-zinc-500">
        Sem score motor individual — usando macro da classe como referência.
      </p>
    );
  }

  const tick = motor.ticker;
  return (
    <section className="space-y-4 rounded-lg border border-zinc-800 bg-black p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-medium text-white">Security — {tick.symbol}</h3>
        <span className="text-xs text-zinc-400">Score {formatScore(tick.score)}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${stageBadgeClass(
            tick.stageLabel,
          )}`}
        >
          {tick.stageLabel}
        </span>
        {motor.divergesFromClass ? (
          <span className="text-[10px] text-amber-400">Diverges from class</span>
        ) : null}
      </div>
      <MotorIndicatorsTable indicators={motor.tickerIndicators} title="SecurityScore drivers (no RSI)" />
      {motor.classId === "cash_equivalents" ? (
        <p className="text-[10px] text-zinc-500">
          SecurityScore: percentis cross-sectional (liquidez + estabilidade + |Δ50|). Rankeia
          instrumentos cash no mesmo momento — não altera CashRegimeScore.
        </p>
      ) : null}
      <SymbolScoreHistoryChart
        title="Ticker composite score (historico)"
        points={motor.tickerScoreHistory}
        color="#34d399"
      />
    </section>
  );
}
