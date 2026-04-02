import type {
  Goal,
  BalanceItem,
  BudgetCategory,
  BudgetEntry,
  Transaction,
} from "@prisma/client";

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

export function serializeTransaction(t: Transaction) {
  return {
    ...t,
    amount: t.amount.toString(),
    occurredAt: t.occurredAt.toISOString(),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
