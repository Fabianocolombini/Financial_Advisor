import { fetchMarketEnrichmentMap } from "@/lib/motor/enrich-yahoo-perf";
import { loadMotorDashboardSnapshot } from "@/lib/motor/load-snapshot";
import { buildWatchlistGroups } from "@/lib/motor/watchlist-groups";
import { prisma } from "@/lib/prisma";

export async function loadWatchlistView(userId: string) {
  const [watchlist, snapshot] = await Promise.all([
    prisma.userWatchlistItem.findMany({
      where: { userId },
      orderBy: { addedAt: "desc" },
    }),
    loadMotorDashboardSnapshot(),
  ]);

  const mapped = watchlist.map((w) => ({
    id: w.id,
    symbol: w.symbol,
    classId: w.classId,
    name: w.name,
    exchange: w.exchange,
    kind: w.kind,
  }));

  const yahooMarketBySymbol =
    mapped.length > 0
      ? await fetchMarketEnrichmentMap(mapped.map((w) => w.symbol))
      : undefined;

  const groups = buildWatchlistGroups(mapped, snapshot, yahooMarketBySymbol);

  return { watchlist, snapshot, groups };
}
