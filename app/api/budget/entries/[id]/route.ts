import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { writeRateLimitOr429 } from "@/lib/rate-limit";
import { updateBudgetEntrySchema } from "@/lib/schemas/api";
import { serializeBudgetEntry } from "@/lib/serialize";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

async function getOwned(userId: string, id: string) {
  return prisma.budgetEntry.findFirst({
    where: { id, userId },
    include: { category: true },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const rl = writeRateLimitOr429(request);
  if (rl) return rl;

  const session = await requireSession();
  if (!session.ok) return session.response;

  const { id } = await params;
  const existing = await getOwned(session.userId, id);
  if (!existing) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = updateBudgetEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validação falhou", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { plannedAmount } = parsed.data;
  const entry = await prisma.budgetEntry.update({
    where: { id },
    data: { plannedAmount: new Prisma.Decimal(plannedAmount) },
    include: { category: true },
  });

  return NextResponse.json({
    data: {
      ...serializeBudgetEntry(entry),
      category: { id: entry.category.id, name: entry.category.name },
    },
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const rl = writeRateLimitOr429(request);
  if (rl) return rl;

  const session = await requireSession();
  if (!session.ok) return session.response;

  const { id } = await params;
  const existing = await getOwned(session.userId, id);
  if (!existing) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  await prisma.budgetEntry.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
