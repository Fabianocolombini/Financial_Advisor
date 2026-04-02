import Link from "next/link";
import { shiftMonth } from "@/lib/month";

export function BudgetMonthNav({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const label = new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <Link
        href={`/orcamento?year=${prev.year}&month=${prev.month}`}
        className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ← Mês anterior
      </Link>
      <span className="text-sm font-medium capitalize text-zinc-900 dark:text-zinc-50">
        {label}
      </span>
      <Link
        href={`/orcamento?year=${next.year}&month=${next.month}`}
        className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        Próximo mês →
      </Link>
    </div>
  );
}
