import { MyWalletPanel } from "@/components/home/MyWalletPanel";
import { WalletPageClient } from "@/components/wallet/WalletPageClient";
import { getDashboardStats } from "@/lib/dashboard";
import { formatBRL } from "@/lib/format";
import { getServerUserId } from "@/lib/server-user";

export default async function WalletPage() {
  const userId = await getServerUserId();
  if (!userId) return null;

  const stats = await getDashboardStats(userId);

  const financeStats = [
    {
      label: "Net worth",
      value: formatBRL(stats.netWorth.toNumber()),
      href: "/net-worth",
      description: "Assets minus liabilities you have recorded.",
    },
    {
      label: "Goals",
      value: String(stats.goalCount),
      href: "/goals",
      description: "Financial goals being tracked.",
    },
    {
      label: "Budget",
      value: String(stats.categoryCount),
      href: "/budget",
      description: "Monthly spending structure.",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-title text-2xl tracking-tight text-white">My Wallet</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Names you already bought: result vs entry price, floor and ceiling, and whether
          the motor asks you to hold, add more, or exit. The side panel is available
          on any screen — pin it or let it float.
        </p>
      </div>

      <div className="min-h-[28rem] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        <WalletPageClient />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-400">Personal finances</h2>
        <MyWalletPanel stats={financeStats} compact />
      </section>
    </div>
  );
}
