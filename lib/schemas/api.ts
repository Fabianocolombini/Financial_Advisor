import { z } from "zod";

const optionalDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null || v === "") return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  });

export const createGoalSchema = z.object({
  title: z.string().min(1).max(200),
  targetAmount: z.coerce.number().positive(),
  deadline: optionalDate,
});

export const updateGoalSchema = createGoalSchema.partial();

export const createBalanceItemSchema = z.object({
  label: z.string().min(1).max(200),
  kind: z.enum(["ASSET", "LIABILITY"]),
  amount: z.coerce.number().positive(),
});

export const updateBalanceItemSchema = createBalanceItemSchema.partial();

export const createBudgetCategorySchema = z.object({
  name: z.string().min(1).max(100),
});

export const updateBudgetCategorySchema = z.object({
  name: z.string().min(1).max(100),
});

export const createBudgetEntrySchema = z.object({
  categoryId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  plannedAmount: z.coerce.number().min(0),
});

export const updateBudgetEntrySchema = z.object({
  plannedAmount: z.coerce.number().min(0),
});

export const budgetEntriesQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
