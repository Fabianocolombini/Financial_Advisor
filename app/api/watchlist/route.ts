import { requireSession } from "@/lib/api-auth";
import { dispatchMotorSymbol } from "@/lib/motor/dispatch-symbol-motor";
import { prisma } from "@/lib/prisma";
import { writeRateLimitOr429 } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

const addSchema = z.object({
  symbol: z.string().min(1).max(32),
  classId: z.string().min(1).max(64),
  name: z.string().min(1).max(256),
  exchange: z.string().max(64).optional(),
  kind: z.string().max(32).optional(),
});

export async function GET() {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const items = await prisma.userWatchlistItem.findMany({
    where: { userId: session.userId },
    orderBy: { addedAt: "desc" },
  });

  return NextResponse.json({
    data: items.map((item) => ({
      id: item.id,
      symbol: item.symbol,
      classId: item.classId,
      name: item.name,
      exchange: item.exchange,
      kind: item.kind,
      addedAt: item.addedAt.toISOString(),
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

  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validação falhou", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { symbol, classId, name, exchange, kind } = parsed.data;
  const normalized = symbol.toUpperCase();

  const item = await prisma.userWatchlistItem.upsert({
    where: {
      userId_symbol: { userId: session.userId, symbol: normalized },
    },
    create: {
      userId: session.userId,
      symbol: normalized,
      classId,
      name,
      exchange: exchange ?? null,
      kind: kind ?? null,
    },
    update: {
      classId,
      name,
      exchange: exchange ?? null,
      kind: kind ?? null,
    },
  });

  revalidatePath("/");
  revalidatePath("/mercado");

  const motorDispatch = await dispatchMotorSymbol(normalized, classId);

  return NextResponse.json({
    data: {
      id: item.id,
      symbol: item.symbol,
      classId: item.classId,
      name: item.name,
      exchange: item.exchange,
      kind: item.kind,
      addedAt: item.addedAt.toISOString(),
    },
    motor: {
      queued: motorDispatch.ok,
      error: motorDispatch.error,
    },
  });
}

export async function DELETE(request: Request) {
  const rl = writeRateLimitOr429(request);
  if (rl) return rl;

  const session = await requireSession();
  if (!session.ok) return session.response;

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol é obrigatório" }, { status: 400 });
  }

  await prisma.userWatchlistItem.deleteMany({
    where: {
      userId: session.userId,
      symbol: symbol.toUpperCase(),
    },
  });

  revalidatePath("/");
  revalidatePath("/mercado");

  return NextResponse.json({ ok: true });
}
