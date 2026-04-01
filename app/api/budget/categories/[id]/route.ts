import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { updateBudgetCategorySchema } from "@/lib/schemas/api";
import { serializeBudgetCategory } from "@/lib/serialize";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

async function getOwned(userId: string, id: string) {
  return prisma.budgetCategory.findFirst({
    where: { id, userId },
  });
}

export async function PATCH(request: Request, { params }: Params) {
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

  const parsed = updateBudgetCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validação falhou", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const category = await prisma.budgetCategory.update({
    where: { id },
    data: { name: parsed.data.name },
  });

  return NextResponse.json({ data: serializeBudgetCategory(category) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const { id } = await params;
  const existing = await getOwned(session.userId, id);
  if (!existing) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  await prisma.budgetCategory.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
