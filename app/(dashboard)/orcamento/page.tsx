import { auth } from "@/auth";
import { AddBudgetCategoryForm } from "@/components/forms/AddBudgetCategoryForm";
import { AddBudgetEntryForm } from "@/components/forms/AddBudgetEntryForm";
import { DeleteApiButton } from "@/components/forms/DeleteApiButton";
import { formatBRL } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export default async function OrcamentoPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [categories, entries] = await Promise.all([
    prisma.budgetCategory.findMany({
      where: { userId: session.user.id },
      orderBy: { name: "asc" },
    }),
    prisma.budgetEntry.findMany({
      where: { userId: session.user.id, year, month },
      include: { category: true },
      orderBy: { category: { name: "asc" } },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Orçamento
        </h1>
        <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">
          Categorias e valores planejados para{" "}
          <strong className="text-zinc-900 dark:text-zinc-50">
            {month}/{year}
          </strong>
          .
        </p>
      </div>

      <AddBudgetCategoryForm />

      <div className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Categorias
        </h2>
        <ul className="flex flex-wrap gap-2">
          {categories.length === 0 ? (
            <li className="text-sm text-zinc-500 dark:text-zinc-400">
              Nenhuma categoria.
            </li>
          ) : (
            categories.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <span>{c.name}</span>
                <DeleteApiButton
                  url={`/api/budget/categories/${c.id}`}
                  label="×"
                />
              </li>
            ))
          )}
        </ul>
      </div>

      <AddBudgetEntryForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        year={year}
        month={month}
      />

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Lançamentos do mês
        </h2>
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {entries.length === 0 ? (
            <li className="p-4 text-sm text-zinc-500 dark:text-zinc-400">
              Nenhum valor planejado para este mês.
            </li>
          ) : (
            entries.map((e) => (
              <li key={e.id} className="p-4 text-sm">
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {e.category.name}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400">
                  {" "}
                  — planejado {formatBRL(e.plannedAmount.toNumber())}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
