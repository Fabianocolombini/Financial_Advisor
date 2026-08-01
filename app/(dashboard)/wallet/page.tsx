import { MyWalletPanel } from "@/components/home/MyWalletPanel";
import { getDashboardStats } from "@/lib/dashboard";
import { formatBRL } from "@/lib/format";
import { getServerUserId } from "@/lib/server-user";

export default async function WalletPage() {
  const userId = await getServerUserId();
  if (!userId) return null;

  const stats = await getDashboardStats(userId);

  const walletStats = [
    {
      label: "Net worth",
      value: formatBRL(stats.netWorth.toNumber()),
      href: "/patrimonio",
      description: "Assets minus liabilities on file.",
    },
    {
      label: "Goals",
      value: String(stats.goalCount),
      href: "/objetivos",
      description: "Financial goals you are tracking.",
    },
    {
      label: "Budget categories",
      value: String(stats.categoryCount),
      href: "/orcamento",
      description: "Monthly budget structure.",
    },
    {
      label: "Balance items",
      value: String(stats.balanceItemCount),
      href: "/patrimonio",
      description: "Individual assets and liabilities.",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-title text-2xl tracking-tight text-white">My Wallet</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          How your personal finances look today. Symbol research and market scores live on
          Home and Markets.
        </p>
      </div>
      <MyWalletPanel stats={walletStats} />
    </div>
  );
}
