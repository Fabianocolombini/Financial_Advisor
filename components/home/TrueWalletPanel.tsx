import Link from "next/link";

type WalletStat = {
  label: string;
  value: string;
  href: string;
};

export function TrueWalletPanel({
  stats,
}: {
  stats: WalletStat[];
}) {
  return (
    <aside
      className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 lg:w-[17rem] shrink-0"
      aria-label="True Wallet"
    >
      <div>
        <h2 className="font-title text-sm tracking-tight text-white">True Wallet</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          How your finances look today — before we decide which businesses should
          form your portfolio.
        </p>
      </div>
      <ul className="mt-4 space-y-2">
        {stats.map((stat) => (
          <li key={stat.href}>
            <Link
              href={stat.href}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/80 bg-black/40 px-3 py-2 transition-colors hover:border-zinc-700 hover:bg-zinc-900/60"
            >
              <span className="text-xs text-zinc-500">{stat.label}</span>
              <span className="font-title text-sm tabular-nums text-white">
                {stat.value}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
