import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function getDashboardStats(userId: string) {
  const [goals, balanceItems, categoryCount] = await Promise.all([
    prisma.goal.findMany({ where: { userId } }),
    prisma.balanceItem.findMany({ where: { userId } }),
    prisma.budgetCategory.count({ where: { userId } }),
  ]);

  let assets = new Prisma.Decimal(0);
  let liabilities = new Prisma.Decimal(0);
  for (const item of balanceItems) {
    if (item.kind === "ASSET") assets = assets.add(item.amount);
    else liabilities = liabilities.add(item.amount);
  }
  const netWorth = assets.sub(liabilities);

  return {
    goalCount: goals.length,
    netWorth,
    categoryCount,
    balanceItemCount: balanceItems.length,
  };
}
