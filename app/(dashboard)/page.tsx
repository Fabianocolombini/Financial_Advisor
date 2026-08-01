import Link from "next/link";
import { MotorDataFreshness } from "@/components/home/MotorDataFreshness";
import { loadMotorDashboardSnapshot } from "@/lib/motor/load-snapshot";
import { loadWatchlistView } from "@/lib/motor/load-watchlist-view";
import { getServerUserId } from "@/lib/server-user";

export default async function HomePage() {
  const userId = await getServerUserId();
  if (!userId) return null;

  const [{ watchlist, groups }, snapshot] = await Promise.all([
    loadWatchlistView(userId),
    loadMotorDashboardSnapshot(),
  ]);

  const classCount = groups.length;
  const symbolCount = watchlist.length;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="font-title text-2xl tracking-tight text-white">Home</h1>
        <p className="max-w-2xl text-sm text-zinc-400">
          Start in search (bar above): pick an asset class, tap ★ on the papers you want
          to follow. Scores, 1D performance, and purchase stage live on{" "}
          <Link href="/mercado" className="text-zinc-200 underline-offset-2 hover:underline">
            Markets
          </Link>
          . Personal finances are in{" "}
          <Link href="/wallet" className="text-zinc-200 underline-offset-2 hover:underline">
            My Wallet
          </Link>
          .
        </p>
        <MotorDataFreshness snapshot={snapshot} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/mercado"
          className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-5 transition-colors hover:border-zinc-700 hover:bg-zinc-900/40"
        >
          <h2 className="font-title text-white">Markets</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {symbolCount === 0
              ? "No symbols followed yet — add some from search."
              : `${symbolCount} symbol${symbolCount === 1 ? "" : "s"} across ${classCount} class${classCount === 1 ? "" : "es"} — scores, 1D change, stage, indicators.`}
          </p>
          <p className="mt-3 text-xs text-zinc-400">Open Markets →</p>
        </Link>
        <Link
          href="/wallet"
          className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-5 transition-colors hover:border-zinc-700 hover:bg-zinc-900/40"
        >
          <h2 className="font-title text-white">My Wallet</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Net worth, goals, and budget — how your finances look today.
          </p>
          <p className="mt-3 text-xs text-zinc-400">Open My Wallet →</p>
        </Link>
      </div>

      <p className="text-[10px] text-zinc-600">
        Educational use only — not regulated investment advice.
      </p>
    </div>
  );
}
