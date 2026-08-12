import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { writeRateLimitOr429 } from "@/lib/rate-limit";
import { loadWalletView } from "@/lib/wallet/load-wallet-view";
import { upsertHoldingSchema } from "@/lib/wallet/schema";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const view = await loadWalletView(session.userId);
  return NextResponse.json({ data: view });
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

  const parsed = upsertHoldingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validação falhou", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const symbol = data.symbol.toUpperCase();
  const purchasedAt = new Date(data.purchasedAt);
  if (Number.isNaN(purchasedAt.getTime())) {
    return NextResponse.json({ error: "Data de compra inválida" }, { status: 400 });
  }
  if (
    data.targetMin != null &&
    data.targetMax != null &&
    data.targetMin >= data.targetMax
  ) {
    return NextResponse.json(
      { error: "O piso precisa ser menor que o teto" },
      { status: 400 },
    );
  }

  const holding = await prisma.walletHolding.upsert({
    where: { userId_symbol: { userId: session.userId, symbol } },
    create: {
      userId: session.userId,
      symbol,
      classId: data.classId,
      name: data.name,
      exchange: data.exchange ?? null,
      kind: data.kind ?? null,
      quantity: new Prisma.Decimal(data.quantity),
      costPrice: new Prisma.Decimal(data.costPrice),
      purchasedAt,
      targetMin: data.targetMin != null ? new Prisma.Decimal(data.targetMin) : null,
      targetMax: data.targetMax != null ? new Prisma.Decimal(data.targetMax) : null,
      notes: data.notes ?? null,
    },
    update: {
      classId: data.classId,
      name: data.name,
      exchange: data.exchange ?? null,
      kind: data.kind ?? null,
      quantity: new Prisma.Decimal(data.quantity),
      costPrice: new Prisma.Decimal(data.costPrice),
      purchasedAt,
      targetMin: data.targetMin != null ? new Prisma.Decimal(data.targetMin) : null,
      targetMax: data.targetMax != null ? new Prisma.Decimal(data.targetMax) : null,
      notes: data.notes ?? null,
    },
  });

  revalidatePath("/wallet");

  return NextResponse.json({
    data: { id: holding.id, symbol: holding.symbol },
  });
}

export async function DELETE(request: Request) {
  const rl = writeRateLimitOr429(request);
  if (rl) return rl;

  const session = await requireSession();
  if (!session.ok) return session.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
  }

  await prisma.walletHolding.deleteMany({
    where: { id, userId: session.userId },
  });

  revalidatePath("/wallet");
  return NextResponse.json({ ok: true });
}
