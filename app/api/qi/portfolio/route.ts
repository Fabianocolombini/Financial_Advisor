import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const portfolios = await prisma.qiPortfolio.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: "desc" },
    include: {
      holdings: {
        include: { asset: { select: { symbol: true, name: true } } },
      },
    },
  });

  return NextResponse.json({
    portfolios: portfolios.map((p) => ({
      id: p.id,
      name: p.name,
      baseCurrency: p.baseCurrency,
      holdings: p.holdings.map((h) => ({
        symbol: h.asset.symbol,
        name: h.asset.name,
        quantity: h.quantity?.toString() ?? null,
        weight: h.weight?.toString() ?? null,
        asOfDate: h.asOfDate?.toISOString().slice(0, 10) ?? null,
      })),
    })),
  });
}
