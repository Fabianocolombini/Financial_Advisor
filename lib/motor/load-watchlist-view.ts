import { prisma } from "@/lib/prisma";
import { fetchPerfPctMap } from "@/lib/motor/enrich-yahoo-perf";
import { loadMotorDashboardSnapshot } from "@/lib/motor/load-snapshot";
import { buildWatchlistGroups } from "@/lib/motor/watchlist-groups";

function needsYahooPerf(
  snapshot: Awaited<ReturnType<typeof loadMotorDashboardSnapshot>>,
  symbol: string,
): boolean {
  const tick = snapshot?.tickers[symbol.toUpperCase()];
  return (
    tick?.perf1dPct == null ||
    tick?.perf7dPct == null ||
    tick?.perf15dPct == null
  );
}

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

  const symbolsNeedingYahoo = mapped
    .filter((w) => needsYahooPerf(snapshot, w.symbol))
    .map((w) => w.symbol);

  const yahooPerfBySymbol =
    symbolsNeedingYahoo.length > 0
      ? await fetchPerfPctMap(symbolsNeedingYahoo)
      : undefined;

  const groups = buildWatchlistGroups(mapped, snapshot, yahooPerfBySymbol);

  return { watchlist, snapshot, groups };
}
