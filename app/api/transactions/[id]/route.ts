import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { writeRateLimitOr429 } from "@/lib/rate-limit";
import { updateTransactionSchema } from "@/lib/schemas/api";
import { serializeTransaction } from "@/lib/serialize";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

async function getOwned(userId: string, id: string) {
  return prisma.transaction.findFirst({
    where: { id, userId },
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

  const parsed = updateTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validação falhou", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { categoryId, amount, occurredAt, note } = parsed.data;
  const data: Prisma.TransactionUpdateInput = {};

  if (categoryId !== undefined) {
    if (categoryId === null) {
      data.category = { disconnect: true };
    } else {
      const cat = await prisma.budgetCategory.findFirst({
        where: { id: categoryId, userId: session.userId },
      });
      if (!cat) {
        return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
      }
      data.category = { connect: { id: categoryId } };
    }
  }
  if (amount !== undefined) data.amount = new Prisma.Decimal(amount);
  if (occurredAt !== undefined) {
    const at = new Date(occurredAt);
    if (Number.isNaN(at.getTime())) {
      return NextResponse.json({ error: "Data inválida" }, { status: 400 });
    }
    data.occurredAt = at;
  }
  if (note !== undefined) data.note = note;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  }

  const row = await prisma.transaction.update({
    where: { id },
    data,
    include: { category: true },
  });

  return NextResponse.json({
    data: {
      ...serializeTransaction(row),
      category: row.category
        ? { id: row.category.id, name: row.category.name }
        : null,
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

  await prisma.transaction.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
