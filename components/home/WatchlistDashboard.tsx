import { MotorDataFreshness } from "@/components/home/MotorDataFreshness";
import { WatchlistClassTable } from "@/components/home/WatchlistClassTable";
import type { MotorDashboardSnapshot } from "@/lib/motor/snapshot-types";
import type { WatchlistClassGroup } from "@/lib/motor/snapshot-types";

export function WatchlistDashboard({
  title,
  description,
  snapshot,
  groups,
  emptyHint,
}: {
  title: string;
  description: string;
  snapshot: MotorDashboardSnapshot | null;
  groups: WatchlistClassGroup[];
  emptyHint?: string;
}) {
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="font-title text-2xl tracking-tight text-white">{title}</h1>
        <p className="font-body max-w-2xl text-zinc-400">{description}</p>
        <MotorDataFreshness snapshot={snapshot} />
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center">
          <p className="font-title text-white">No symbols in your watchlist</p>
          <p className="mt-2 text-sm text-zinc-500">
            {emptyHint ??
              "Open search above, pick a class (Cash, Treasuries, US Equity…), and tap ★ on the papers you want to follow."}
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {groups.map((group) => (
            <WatchlistClassTable key={group.classId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
