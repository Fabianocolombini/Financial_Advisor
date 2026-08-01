import { WatchlistDashboard } from "@/components/home/WatchlistDashboard";
import { loadWatchlistView } from "@/lib/motor/load-watchlist-view";
import { getServerUserId } from "@/lib/server-user";

export default async function HomePage() {
  const userId = await getServerUserId();
  if (!userId) return null;

  const { snapshot, groups } = await loadWatchlistView(userId);

  return (
    <WatchlistDashboard
      title="Home"
      description="Pick symbols in search (★) by asset class, then review scores, 1D performance, indicators, and purchase stage here."
      snapshot={snapshot}
      groups={groups}
    />
  );
}
