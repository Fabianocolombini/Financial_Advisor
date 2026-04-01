import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { updateGoalSchema } from "@/lib/schemas/api";
import { serializeGoal } from "@/lib/serialize";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

async function getOwnedGoal(userId: string, id: string) {
  return prisma.goal.findFirst({
    where: { id, userId },
  });
}

export async function GET(_request: Request, { params }: Params) {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const { id } = await params;
  const goal = await getOwnedGoal(session.userId, id);
  if (!goal) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ data: serializeGoal(goal) });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const { id } = await params;
  const existing = await getOwnedGoal(session.userId, id);
  if (!existing) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = updateGoalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validação falhou", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { title, targetAmount, deadline } = parsed.data;
  const data: Prisma.GoalUpdateInput = {};
  if (title !== undefined) data.title = title;
  if (targetAmount !== undefined) data.targetAmount = new Prisma.Decimal(targetAmount);
  if (deadline !== undefined) data.deadline = deadline ?? null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  }

  const goal = await prisma.goal.update({
    where: { id },
    data,
  });

  return NextResponse.json({ data: serializeGoal(goal) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const { id } = await params;
  const existing = await getOwnedGoal(session.userId, id);
  if (!existing) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  await prisma.goal.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
