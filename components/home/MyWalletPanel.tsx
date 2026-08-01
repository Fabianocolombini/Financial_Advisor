import Link from "next/link";

type WalletStat = {
  label: string;
  value: string;
  href: string;
  description?: string;
};

export function MyWalletPanel({
  stats,
  compact = false,
}: {
  stats: WalletStat[];
  compact?: boolean;
}) {
  return (
    <aside
      className={`rounded-xl border border-zinc-800 bg-zinc-950/80 ${compact ? "p-4" : "p-6"}`}
      aria-label="My Wallet"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-black text-zinc-300"
          aria-hidden
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9.75A2.25 2.25 0 0018.75 7.5H5.25A2.25 2.25 0 003 9.75v2.25"
            />
          </svg>
        </div>
        <div>
          <h2 className="font-title text-base tracking-tight text-white">My Wallet</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Your finances today — net worth, goals, and budget. Separate from the symbols
            you are evaluating for the portfolio.
          </p>
        </div>
      </div>
      <ul className="mt-5 space-y-2">
        {stats.map((stat) => (
          <li key={stat.href}>
            <Link
              href={stat.href}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/80 bg-black/40 px-3 py-2.5 transition-colors hover:border-zinc-700 hover:bg-zinc-900/60"
            >
              <div className="min-w-0">
                <span className="text-xs text-zinc-500">{stat.label}</span>
                {stat.description && !compact ? (
                  <p className="mt-0.5 text-[10px] text-zinc-600">{stat.description}</p>
                ) : null}
              </div>
              <span className="font-title shrink-0 text-sm tabular-nums text-white">
                {stat.value}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
