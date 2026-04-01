import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createGoalSchema } from "@/lib/schemas/api";
import { serializeGoal } from "@/lib/serialize";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const goals = await prisma.goal.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ data: goals.map(serializeGoal) });
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

  const parsed = createGoalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validação falhou", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { title, targetAmount, deadline } = parsed.data;

  const goal = await prisma.goal.create({
    data: {
      userId: session.userId,
      title,
      targetAmount: new Prisma.Decimal(targetAmount),
      deadline: deadline ?? null,
    },
  });

  return NextResponse.json({ data: serializeGoal(goal) }, { status: 201 });
}
