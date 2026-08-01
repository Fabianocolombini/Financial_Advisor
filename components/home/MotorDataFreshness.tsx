import { motorFreshnessLines } from "@/lib/motor/format-freshness";
import type { MotorDashboardSnapshot } from "@/lib/motor/snapshot-types";

export function MotorDataFreshness({
  snapshot,
}: {
  snapshot: MotorDashboardSnapshot | null;
}) {
  const { primary, secondary } = motorFreshnessLines(snapshot);

  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2">
      <p className="text-xs text-zinc-300">{primary}</p>
      {secondary ? <p className="mt-0.5 text-[10px] text-zinc-600">{secondary}</p> : null}
    </div>
  );
}
