import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { writeRateLimitOr429 } from "@/lib/rate-limit";
import { createBudgetCategorySchema } from "@/lib/schemas/api";
import { serializeBudgetCategory } from "@/lib/serialize";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const categories = await prisma.budgetCategory.findMany({
    where: { userId: session.userId },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: categories.map(serializeBudgetCategory) });
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

  const parsed = createBudgetCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validação falhou", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const category = await prisma.budgetCategory.create({
    data: {
      userId: session.userId,
      name: parsed.data.name,
    },
  });

  return NextResponse.json({ data: serializeBudgetCategory(category) }, { status: 201 });
}
