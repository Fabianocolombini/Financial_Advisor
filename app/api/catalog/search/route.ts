import { requireSession } from "@/lib/api-auth";
import { searchCatalog } from "@/lib/catalog/search";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const classId = searchParams.get("class") ?? "all";
  const sector = searchParams.get("sector") ?? "all";
  const limit = Math.min(Number(searchParams.get("limit") ?? 30), 50);

  const watchlist = await prisma.userWatchlistItem.findMany({
    where: { userId: session.userId },
    select: { symbol: true },
  });
  const watchlistSymbols = new Set(
    watchlist.map((w) => w.symbol.toUpperCase()),
  );

  const data = await searchCatalog({
    q,
    classId,
    sector,
    watchlistSymbols,
    limit,
  });

  return NextResponse.json({ data });
}
