import { describe, expect, it } from "vitest";
import {
  budgetEntriesQuerySchema,
  createGoalSchema,
  createTransactionSchema,
} from "@/lib/schemas/api";

describe("createGoalSchema", () => {
  it("aceita payload válido", () => {
    const r = createGoalSchema.safeParse({
      title: "Viagem",
      targetAmount: 5000,
      deadline: null,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.title).toBe("Viagem");
  });

  it("rejeita valor alvo não positivo", () => {
    const r = createGoalSchema.safeParse({
      title: "X",
      targetAmount: 0,
    });
    expect(r.success).toBe(false);
  });
});

describe("budgetEntriesQuerySchema", () => {
  it("coage year e month de string", () => {
    const r = budgetEntriesQuerySchema.safeParse({ year: "2026", month: "4" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.year).toBe(2026);
      expect(r.data.month).toBe(4);
    }
  });
});

describe("createTransactionSchema", () => {
  it("aceita sem categoria", () => {
    const r = createTransactionSchema.safeParse({
      amount: 100,
      occurredAt: "2026-04-15T12:00:00.000Z",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.categoryId).toBeUndefined();
  });
});
