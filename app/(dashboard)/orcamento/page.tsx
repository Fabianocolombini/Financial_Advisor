import { BudgetMonthNav } from "@/components/budget/BudgetMonthNav";
import { AddBudgetCategoryForm } from "@/components/forms/AddBudgetCategoryForm";
import { AddBudgetEntryForm } from "@/components/forms/AddBudgetEntryForm";
import { AddTransactionForm } from "@/components/forms/AddTransactionForm";
import { DeleteApiButton } from "@/components/forms/DeleteApiButton";
import { EditBudgetEntryRow } from "@/components/forms/EditBudgetEntryRow";
import { TransactionList } from "@/components/forms/TransactionList";
import { buildBudgetComparison } from "@/lib/budget-comparison";
import { formatBRL } from "@/lib/format";
import { monthRangeLocal } from "@/lib/month";
import { prisma } from "@/lib/prisma";
import { serializeTransaction } from "@/lib/serialize";
import { getServerUserId } from "@/lib/server-user";

type Props = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

function parseYm(
  rawY: string | undefined,
  rawM: string | undefined,
  fallback: Date,
) {
  const y = rawY ? Number.parseInt(rawY, 10) : fallback.getFullYear();
  const m = rawM ? Number.parseInt(rawM, 10) : fallback.getMonth() + 1;
  if (!Number.isFinite(y) || y < 2000 || y > 2100) return null;
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  return { year: y, month: m };
}

export default async function OrcamentoPage({ searchParams }: Props) {
  const userId = await getServerUserId();
  if (!userId) return null;

  const sp = await searchParams;
  const now = new Date();
  const ym = parseYm(sp.year, sp.month, now);
  if (!ym) {
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    return (
      <div className="text-sm text-red-600">
        Invalid year/month. Use{" "}
        <a href={`/orcamento?year=${y}&month=${m}`} className="underline">
          {y}/{m}
        </a>
        .
      </div>
    );
  }

  const { year, month } = ym;
  const { start, end } = monthRangeLocal(year, month);

  const [categories, entries, transactions] = await Promise.all([
    prisma.budgetCategory.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    }),
    prisma.budgetEntry.findMany({
      where: { userId, year, month },
      include: { category: true },
      orderBy: { category: { name: "asc" } },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        occurredAt: { gte: start, lt: end },
      },
      include: { category: true },
      orderBy: { occurredAt: "desc" },
    }),
  ]);

  const categoryLookup = new Map(
    categories.map((c) => [c.id, c.name] as const),
  );

  const comparison = buildBudgetComparison({
    entries: entries.map((e) => ({
      categoryId: e.categoryId,
      categoryName: e.category.name,
      plannedAmount: e.plannedAmount,
    })),
    transactions: transactions.map((t) => ({
      categoryId: t.categoryId,
      amount: t.amount,
    })),
    categoryLookup,
  });

  const txRows = transactions.map((t) => {
    const s = serializeTransaction(t);
    return {
      id: s.id,
      amount: t.amount.toNumber(),
      occurredAt: s.occurredAt,
      note: t.note,
      category: t.category
        ? { id: t.category.id, name: t.category.name }
        : null,
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-title text-2xl tracking-tight text-white">Budget</h1>
        <p className="font-body mt-2 max-w-2xl text-zinc-400">
          Planned vs actual by category for the selected month.
        </p>
      </div>

      <BudgetMonthNav year={year} month={month} />

      <AddBudgetCategoryForm />

      <div className="space-y-4">
        <h2 className="font-title text-sm text-white">Categories</h2>
        <ul className="flex flex-wrap gap-2">
          {categories.length === 0 ? (
            <li className="text-sm text-zinc-500">No categories.</li>
          ) : (
            categories.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-sm text-white"
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

      <section id="planejado" className="space-y-4">
        <h2 className="font-title text-sm text-white">Planned amounts</h2>
        <AddBudgetEntryForm
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          year={year}
          month={month}
        />
        <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
          {entries.length === 0 ? (
            <li className="p-4 text-sm text-zinc-500">No planned amounts for this month.</li>
          ) : (
            entries.map((e) => (
              <EditBudgetEntryRow
                key={e.id}
                entryId={e.id}
                categoryName={e.category.name}
                plannedAmount={e.plannedAmount.toNumber()}
              />
            ))
          )}
        </ul>
      </section>

      <section id="comparativo" className="space-y-4">
        <h2 className="font-title text-sm text-white">Comparison (planned vs actual)</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[28rem] text-left text-sm text-white">
            <thead className="border-b border-zinc-800 bg-zinc-950">
              <tr>
                <th className="p-3 font-medium">Category</th>
                <th className="p-3 font-medium">Planned</th>
                <th className="p-3 font-medium">Actual</th>
                <th className="p-3 font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {comparison.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-zinc-500">
                    No data to compare this month.
                  </td>
                </tr>
              ) : (
                comparison.map((row) => (
                  <tr
                    key={row.categoryId || "uncat"}
                    className="border-b border-zinc-800"
                  >
                    <td className="p-3">{row.categoryName}</td>
                    <td className="p-3 tabular-nums">
                      {formatBRL(row.planned.toNumber())}
                    </td>
                    <td className="p-3 tabular-nums">
                      {formatBRL(row.actual.toNumber())}
                    </td>
                    <td className="p-3 tabular-nums text-zinc-400">
                      {formatBRL(row.variance.toNumber())}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section id="transacoes" className="space-y-4">
        <h2 className="font-title text-sm text-white">Transactions this month</h2>
        <AddTransactionForm
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          defaultYear={year}
          defaultMonth={month}
        />
        <div className="rounded-xl border border-zinc-800">
          <TransactionList rows={txRows} />
        </div>
      </section>
    </div>
  );
}
