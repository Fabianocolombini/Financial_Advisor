import { prisma } from "@/lib/prisma";
import { fetchPerf1dPctMap } from "@/lib/motor/enrich-yahoo-perf";
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

  const mapped = watchlist.map((w) => ({
    id: w.id,
    symbol: w.symbol,
    classId: w.classId,
    name: w.name,
    exchange: w.exchange,
    kind: w.kind,
  }));

  const needsYahooPerf = mapped.filter((w) => {
    const sym = w.symbol.toUpperCase();
    const tick = snapshot?.tickers[sym];
    return tick?.perf1dPct == null;
  });

  const perf1dBySymbol =
    needsYahooPerf.length > 0
      ? await fetchPerf1dPctMap(needsYahooPerf.map((w) => w.symbol))
      : undefined;

  const groups = buildWatchlistGroups(mapped, snapshot, perf1dBySymbol);

  return { watchlist, snapshot, groups };
}
