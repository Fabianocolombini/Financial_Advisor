import { requireSession } from "@/lib/api-auth";
import { QI_MODEL_VERSION } from "@/lib/qi/constants";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const latest = await prisma.qiSectorScoreSnapshot.findFirst({
    where: { modelVersion: QI_MODEL_VERSION },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  if (!latest) {
    return NextResponse.json({
      modelVersion: QI_MODEL_VERSION,
      asOfDate: null,
      sectors: [],
    });
  }

  const rows = await prisma.qiSectorScoreSnapshot.findMany({
    where: {
      asOfDate: latest.asOfDate,
      modelVersion: QI_MODEL_VERSION,
    },
    orderBy: { rank: "asc" },
  });

  return NextResponse.json({
    modelVersion: QI_MODEL_VERSION,
    asOfDate: latest.asOfDate.toISOString().slice(0, 10),
    sectors: rows.map((r) => ({
      sectorCode: r.sectorCode,
      rank: r.rank,
      compositeScore: r.compositeScore.toString(),
      regimeTag: r.regimeTag,
      components: r.components,
    })),
  });
}
