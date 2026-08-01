import { MotorDataFreshness } from "@/components/home/MotorDataFreshness";
import { TrueWalletPanel } from "@/components/home/TrueWalletPanel";
import { WatchlistClassTable } from "@/components/home/WatchlistClassTable";
import { getDashboardStats } from "@/lib/dashboard";
import { formatBRL } from "@/lib/format";
import { loadMotorDashboardSnapshot } from "@/lib/motor/load-snapshot";
import { buildWatchlistGroups } from "@/lib/motor/watchlist-groups";
import { prisma } from "@/lib/prisma";
import { getServerUserId } from "@/lib/server-user";

export default async function HomePage() {
  const userId = await getServerUserId();
  if (!userId) return null;

  const [stats, watchlist, snapshot] = await Promise.all([
    getDashboardStats(userId),
    prisma.userWatchlistItem.findMany({
      where: { userId },
      orderBy: { addedAt: "desc" },
    }),
    loadMotorDashboardSnapshot(),
  ]);

  const groups = buildWatchlistGroups(
    watchlist.map((w) => ({
      id: w.id,
      symbol: w.symbol,
      classId: w.classId,
      name: w.name,
      exchange: w.exchange,
      kind: w.kind,
    })),
    snapshot,
  );

  const trueWalletStats = [
    {
      label: "Net worth",
      value: formatBRL(stats.netWorth.toNumber()),
      href: "/patrimonio",
    },
    {
      label: "Goals",
      value: String(stats.goalCount),
      href: "/objetivos",
    },
    {
      label: "Budget categories",
      value: String(stats.categoryCount),
      href: "/orcamento",
    },
  ];

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="font-title text-2xl tracking-tight text-white">Overview</h1>
          <p className="font-body max-w-2xl text-zinc-400">
            Pick symbols in search (★), then review them here by asset class — scores,
            indicators, and purchase stage (Accumulate / Hold / Reduce).
          </p>
          <MotorDataFreshness snapshot={snapshot} />
        </div>
        <TrueWalletPanel stats={trueWalletStats} />
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center">
          <p className="font-title text-white">No symbols in your watchlist</p>
          <p className="mt-2 text-sm text-zinc-500">
            Open the search bar above, pick Treasuries, REITs, or any class, and tap ★
            on the papers you want to track here.
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
