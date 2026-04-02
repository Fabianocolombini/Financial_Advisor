import { Prisma } from "@prisma/client";

export type CategoryComparison = {
  categoryId: string;
  categoryName: string;
  planned: Prisma.Decimal;
  actual: Prisma.Decimal;
  variance: Prisma.Decimal;
};

/**
 * Agrega planejado (BudgetEntry) vs realizado (Transaction) por categoria no mês.
 * Transações sem categoria entram em linha "Sem categoria".
 * `categoryLookup`: nomes para categorias que só aparecem em transações.
 */
export function buildBudgetComparison(input: {
  entries: { categoryId: string; categoryName: string; plannedAmount: Prisma.Decimal }[];
  transactions: { categoryId: string | null; amount: Prisma.Decimal }[];
  categoryLookup?: Map<string, string>;
}): CategoryComparison[] {
  const nameById = input.categoryLookup ?? new Map<string, string>();
  const plannedByCat = new Map<string, { name: string; sum: Prisma.Decimal }>();
  for (const e of input.entries) {
    const cur = plannedByCat.get(e.categoryId) ?? {
      name: e.categoryName,
      sum: new Prisma.Decimal(0),
    };
    cur.sum = cur.sum.add(e.plannedAmount);
    plannedByCat.set(e.categoryId, cur);
  }

  const actualByCat = new Map<string | null, Prisma.Decimal>();
  for (const t of input.transactions) {
    const key = t.categoryId;
    const cur = actualByCat.get(key) ?? new Prisma.Decimal(0);
    actualByCat.set(key, cur.add(t.amount));
  }

  const ids = new Set<string>();
  for (const id of plannedByCat.keys()) ids.add(id);
  for (const id of actualByCat.keys()) {
    if (id != null) ids.add(id);
  }

  const rows: CategoryComparison[] = [];

  for (const categoryId of ids) {
    const p = plannedByCat.get(categoryId);
    const planned = p?.sum ?? new Prisma.Decimal(0);
    const actual = actualByCat.get(categoryId) ?? new Prisma.Decimal(0);
    const categoryName = p?.name ?? nameById.get(categoryId) ?? "—";
    rows.push({
      categoryId,
      categoryName,
      planned,
      actual,
      variance: planned.sub(actual),
    });
  }

  const uncategorized = actualByCat.get(null);
  if (uncategorized && !uncategorized.equals(0)) {
    rows.push({
      categoryId: "",
      categoryName: "Sem categoria",
      planned: new Prisma.Decimal(0),
      actual: uncategorized,
      variance: new Prisma.Decimal(0).sub(uncategorized),
    });
  }

  rows.sort((a, b) => a.categoryName.localeCompare(b.categoryName, "pt-BR"));
  return rows;
}
