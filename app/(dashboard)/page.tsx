import { SummaryCard } from "@/components/dashboard/SummaryCard";
import { getDashboardStats } from "@/lib/dashboard";
import { formatBRL } from "@/lib/format";
import { getServerUserId } from "@/lib/server-user";

export default async function HomePage() {
  const userId = await getServerUserId();
  if (!userId) return null;

  const stats = await getDashboardStats(userId);
  const net = stats.netWorth.toNumber();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Visão geral
        </h1>
        <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">
          Dados da sua conta (PostgreSQL). Cadastre itens em Patrimônio e metas em
          Objetivos.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          title="Patrimônio líquido"
          value={formatBRL(net)}
          hint="Ativos − passivos cadastrados."
        />
        <SummaryCard
          title="Objetivos"
          value={String(stats.goalCount)}
          hint="Metas em /objetivos."
        />
        <SummaryCard
          title="Categorias de orçamento"
          value={String(stats.categoryCount)}
          hint="Definidas em /orcamento."
        />
      </div>
    </div>
  );
}
