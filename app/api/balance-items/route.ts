import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { writeRateLimitOr429 } from "@/lib/rate-limit";
import { createBalanceItemSchema } from "@/lib/schemas/api";
import { serializeBalanceItem } from "@/lib/serialize";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const items = await prisma.balanceItem.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ data: items.map(serializeBalanceItem) });
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

  const parsed = createBalanceItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validação falhou", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { label, kind, amount } = parsed.data;

  const item = await prisma.balanceItem.create({
    data: {
      userId: session.userId,
      label,
      kind,
      amount: new Prisma.Decimal(amount),
    },
  });

  return NextResponse.json({ data: serializeBalanceItem(item) }, { status: 201 });
}
