import { z } from "zod";

export const upsertHoldingSchema = z.object({
  id: z.string().cuid().optional(),
  symbol: z.string().min(1).max(32),
  classId: z.string().min(1).max(64),
  name: z.string().min(1).max(256),
  exchange: z.string().max(64).optional().nullable(),
  kind: z.string().max(32).optional().nullable(),
  quantity: z.number().positive(),
  costPrice: z.number().positive(),
  purchasedAt: z.string().min(4),
  targetMin: z.number().positive().optional().nullable(),
  targetMax: z.number().positive().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
