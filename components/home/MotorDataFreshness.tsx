import { motorFreshnessLines } from "@/lib/motor/format-freshness";
import type { MotorDashboardSnapshot } from "@/lib/motor/snapshot-types";

export function MotorDataFreshness({
  snapshot,
  prominent = false,
}: {
  snapshot: MotorDashboardSnapshot | null;
  prominent?: boolean;
}) {
  const { primary, secondary } = motorFreshnessLines(snapshot);

  return (
    <div
      className={
        prominent
          ? "rounded-lg border border-zinc-800 bg-zinc-950/80 px-4 py-3"
          : "rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2"
      }
    >
      <p className={prominent ? "text-sm text-zinc-200" : "text-xs text-zinc-300"}>
        {primary}
      </p>
      {secondary ? (
        <p className="mt-1 text-[11px] text-zinc-500">{secondary}</p>
      ) : null}
    </div>
  );
}
