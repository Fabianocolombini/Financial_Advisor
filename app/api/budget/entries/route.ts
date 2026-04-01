import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  budgetEntriesQuerySchema,
  createBudgetEntrySchema,
} from "@/lib/schemas/api";
import { serializeBudgetEntry } from "@/lib/serialize";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const { searchParams } = new URL(request.url);
  const raw = {
    year: searchParams.get("year") ?? undefined,
    month: searchParams.get("month") ?? undefined,
  };
  const parsed = budgetEntriesQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Query inválida", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { year, month } = parsed.data;

  const entries = await prisma.budgetEntry.findMany({
    where: {
      userId: session.userId,
      year,
      month,
    },
    include: { category: true },
    orderBy: { category: { name: "asc" } },
  });

  return NextResponse.json({
    data: entries.map((e) => ({
      ...serializeBudgetEntry(e),
      category: {
        id: e.category.id,
        name: e.category.name,
      },
    })),
  });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session.ok) return session.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = createBudgetEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validação falhou", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { categoryId, year, month, plannedAmount } = parsed.data;

  const category = await prisma.budgetCategory.findFirst({
    where: { id: categoryId, userId: session.userId },
  });
  if (!category) {
    return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
  }

  const entry = await prisma.budgetEntry.upsert({
    where: {
      userId_categoryId_year_month: {
        userId: session.userId,
        categoryId,
        year,
        month,
      },
    },
    create: {
      userId: session.userId,
      categoryId,
      year,
      month,
      plannedAmount: new Prisma.Decimal(plannedAmount),
    },
    update: {
      plannedAmount: new Prisma.Decimal(plannedAmount),
    },
    include: { category: true },
  });

  return NextResponse.json(
    {
      data: {
        ...serializeBudgetEntry(entry),
        category: { id: entry.category.id, name: entry.category.name },
      },
    },
    { status: 201 },
  );
}
