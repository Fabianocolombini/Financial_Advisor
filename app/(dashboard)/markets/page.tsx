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
      description="Performance and motor scores for the symbols you follow — grouped by asset class, ranked by attractiveness. Data date shown at top."
      snapshot={snapshot}
      groups={groups}
      emptyHint="Add symbols from search (Cash, Treasuries, US Equity…) with ★ — they will appear here with daily performance and scores."
    />
  );
}
