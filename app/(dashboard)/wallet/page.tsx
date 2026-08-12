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
      label: "Patrimônio líquido",
      value: formatBRL(stats.netWorth.toNumber()),
      href: "/patrimonio",
      description: "Ativos menos passivos cadastrados.",
    },
    {
      label: "Objetivos",
      value: String(stats.goalCount),
      href: "/objetivos",
      description: "Metas financeiras em acompanhamento.",
    },
    {
      label: "Orçamento",
      value: String(stats.categoryCount),
      href: "/orcamento",
      description: "Estrutura mensal de gastos.",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-title text-2xl tracking-tight text-white">My Wallet</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Papéis que você já comprou: resultado vs o preço de entrada, piso e teto, e se
          o motor pede para manter, aportar mais ou sair. A aba lateral fica disponível
          em qualquer tela — fixe ou deixe flutuar.
        </p>
      </div>

      <div className="min-h-[28rem] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        <WalletPageClient />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-400">Finanças pessoais</h2>
        <MyWalletPanel stats={financeStats} compact />
      </section>
    </div>
  );
}
