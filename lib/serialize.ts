import type { Goal, BalanceItem, BudgetCategory, BudgetEntry } from "@prisma/client";

export function serializeGoal(g: Goal) {
  return {
    ...g,
    targetAmount: g.targetAmount.toString(),
    deadline: g.deadline?.toISOString() ?? null,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

export function serializeBalanceItem(b: BalanceItem) {
  return {
    ...b,
    amount: b.amount.toString(),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

export function serializeBudgetCategory(c: BudgetCategory) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function serializeBudgetEntry(e: BudgetEntry) {
  return {
    ...e,
    plannedAmount: e.plannedAmount.toString(),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
