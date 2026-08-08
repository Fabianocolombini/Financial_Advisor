import type { MotorIndicatorSnapshot } from "@/lib/motor/snapshot-types";
import {
  countIndicatorActions,
  formatIndicatorValue,
  formatScore,
  indicatorActionFromContribution,
  ratingBadgeClass,
  ratingIndex,
  scoreToRating,
  actionClass,
  type MotorRatingLevel,
} from "@/lib/motor/format-scores";

const RATING_LABELS: MotorRatingLevel[] = [
  "Strong Sell",
  "Sell",
  "Hold",
  "Buy",
  "Strong Buy",
];

export function MotorSignalSummary({
  score,
  indicators,
}: {
  score: number | null;
  indicators: MotorIndicatorSnapshot[];
}) {
  const rating = scoreToRating(score);
  const idx = ratingIndex(rating);
  const counts = countIndicatorActions(indicators);
  const needleDeg = -90 + (idx / 4) * 180;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <h3 className="text-sm font-medium text-white">Motor summary</h3>
      <div className="mt-4 flex flex-col items-center">
        <div className="relative h-28 w-56 overflow-hidden">
          <div
            className="absolute bottom-0 left-0 right-0 h-28 rounded-t-full border border-zinc-700 bg-gradient-to-r from-red-900/40 via-zinc-800/30 to-sky-900/40"
          />
          <div
            className="absolute bottom-2 left-1/2 h-24 w-0.5 origin-bottom bg-white/80"
            style={{ transform: `translateX(-50%) rotate(${needleDeg}deg)` }}
          />
        </div>
        <p className={`mt-2 text-2xl font-semibold ${ratingBadgeClass(rating)}`}>
          {rating}
        </p>
        <p className="text-xs text-zinc-500">
          Score {formatScore(score)} · Sell {counts.sell} · Neutral {counts.neutral} · Buy{" "}
          {counts.buy}
        </p>
        <div className="mt-2 flex gap-3 text-[10px] text-zinc-500">
          {RATING_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MotorWhySection({
  stageLabel,
  entryValidated,
  hasMotorData,
  motorScope,
  divergesFromClass,
  dominantIndicator,
  rationale,
  classLabel,
}: {
  stageLabel: string;
  entryValidated: boolean;
  hasMotorData: boolean;
  motorScope: string;
  divergesFromClass: boolean;
  dominantIndicator: { name: string; contribution?: number } | null;
  rationale: string[];
  classLabel: string;
}) {
  const entryLabel = !hasMotorData
    ? "Analyzing"
    : motorScope === "class"
      ? entryValidated
        ? "Class validated"
        : "Class macro"
      : entryValidated
        ? "Validated"
        : "Not validated";

  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 bg-black p-4">
      <h3 className="text-sm font-medium text-white">Why this signal?</h3>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
          Stage: {stageLabel}
        </span>
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
          Entry: {entryLabel}
        </span>
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
          Class: {classLabel}
        </span>
        {divergesFromClass ? (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
            Diverges from class
          </span>
        ) : null}
      </div>
      {dominantIndicator ? (
        <p className="text-sm text-zinc-400">
          Driver: <span className="text-white">{dominantIndicator.name}</span>
          {dominantIndicator.contribution != null
            ? ` (contrib ${dominantIndicator.contribution.toFixed(3)})`
            : null}
        </p>
      ) : null}
      {rationale.length > 0 ? (
        <ul className="space-y-1 text-sm text-zinc-400">
          {rationale.map((line) => (
            <li key={line}>• {line}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">
          Sem rationale detalhado no snapshot — aguarde próximo Motor Daily ou scoring on-demand.
        </p>
      )}
    </section>
  );
}

export function MotorIndicatorsTable({
  indicators,
}: {
  indicators: MotorIndicatorSnapshot[];
}) {
  if (indicators.length === 0) {
    return (
      <p className="text-sm text-zinc-500">Indicadores do motor não disponíveis para este papel.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-800 bg-zinc-950 text-[11px] text-zinc-500">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Value</th>
            <th className="px-3 py-2">Action</th>
            <th className="px-3 py-2">Contribution</th>
            <th className="px-3 py-2">z-score</th>
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
                <td className="px-3 py-2 tabular-nums text-zinc-300">
                  {ind.contribution != null ? ind.contribution.toFixed(3) : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums text-zinc-300">
                  {ind.zScore != null ? ind.zScore.toFixed(2) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
