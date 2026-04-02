import { requireSession } from "@/lib/api-auth";
import { monthRangeLocal } from "@/lib/month";
import { prisma } from "@/lib/prisma";
import { writeRateLimitOr429 } from "@/lib/rate-limit";
import {
  budgetEntriesQuerySchema,
  createTransactionSchema,
} from "@/lib/schemas/api";
import { serializeTransaction } from "@/lib/serialize";
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
  const { start, end } = monthRangeLocal(year, month);

  const list = await prisma.transaction.findMany({
    where: {
      userId: session.userId,
      occurredAt: { gte: start, lt: end },
    },
    include: { category: true },
    orderBy: { occurredAt: "desc" },
  });

  return NextResponse.json({
    data: list.map((t) => ({
      ...serializeTransaction(t),
      category: t.category
        ? { id: t.category.id, name: t.category.name }
        : null,
    })),
  });
}

export async function POST(request: Request) {
  const rl = writeRateLimitOr429(request);
  if (rl) return rl;

  const session = await requireSession();
  if (!session.ok) return session.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = createTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validação falhou", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { categoryId, amount, occurredAt, note } = parsed.data;
  const at = new Date(occurredAt);
  if (Number.isNaN(at.getTime())) {
    return NextResponse.json({ error: "Data inválida" }, { status: 400 });
  }

  if (categoryId) {
    const cat = await prisma.budgetCategory.findFirst({
      where: { id: categoryId, userId: session.userId },
    });
    if (!cat) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }
  }

  const row = await prisma.transaction.create({
    data: {
      userId: session.userId,
      categoryId: categoryId ?? null,
      amount: new Prisma.Decimal(amount),
      occurredAt: at,
      note: note ?? null,
    },
    include: { category: true },
  });

  return NextResponse.json(
    {
      data: {
        ...serializeTransaction(row),
        category: row.category
          ? { id: row.category.id, name: row.category.name }
          : null,
      },
    },
    { status: 201 },
  );
}
