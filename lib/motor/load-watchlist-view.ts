import { prisma } from "@/lib/prisma";
import { loadMotorDashboardSnapshot } from "@/lib/motor/load-snapshot";
import { buildWatchlistGroups } from "@/lib/motor/watchlist-groups";

export async function loadWatchlistView(userId: string) {
  const [watchlist, snapshot] = await Promise.all([
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

  return { watchlist, snapshot, groups };
}
