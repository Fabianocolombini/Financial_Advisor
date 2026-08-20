import { WatchlistDashboard } from "@/components/home/WatchlistDashboard";
import { loadWatchlistView } from "@/lib/motor/load-watchlist-view";
import { getServerUserId } from "@/lib/server-user";

export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  const userId = await getServerUserId();
  if (!userId) return null;

  const { snapshot, groups } = await loadWatchlistView(userId);

  return (
    <WatchlistDashboard
      title="Markets"
      description="Score asks whether the name is good. Trend, Money and To buy ask whether it is time to add cash. Those are separate on purpose — a top name can still be Wait."
      snapshot={snapshot}
      groups={groups}
      emptyHint="Add symbols from search (Cash, Treasuries, US Equity…) with ★ — they will appear here with daily performance and scores."
    />
  );
}
