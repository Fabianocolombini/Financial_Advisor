import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { writeRateLimitOr429 } from "@/lib/rate-limit";
import { updateBalanceItemSchema } from "@/lib/schemas/api";
import { serializeBalanceItem } from "@/lib/serialize";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

async function getOwned(userId: string, id: string) {
  return prisma.balanceItem.findFirst({
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

  const parsed = updateBalanceItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validação falhou", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { label, kind, amount } = parsed.data;
  const data: Prisma.BalanceItemUpdateInput = {};
  if (label !== undefined) data.label = label;
  if (kind !== undefined) data.kind = kind;
  if (amount !== undefined) data.amount = new Prisma.Decimal(amount);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  }

  const item = await prisma.balanceItem.update({
    where: { id },
    data,
  });

  return NextResponse.json({ data: serializeBalanceItem(item) });
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

  await prisma.balanceItem.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
