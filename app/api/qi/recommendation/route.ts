import { requireSession } from "@/lib/api-auth";
import { QI_MODEL_VERSION } from "@/lib/qi/constants";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const rec = await prisma.qiRecommendation.findFirst({
    where: { modelVersion: QI_MODEL_VERSION },
    orderBy: { createdAt: "desc" },
  });

  if (!rec) {
    return NextResponse.json({
      modelVersion: QI_MODEL_VERSION,
      recommendation: null,
    });
  }

  return NextResponse.json({
    modelVersion: QI_MODEL_VERSION,
    recommendation: {
      id: rec.id,
      createdAt: rec.createdAt.toISOString(),
      validFrom: rec.validFrom.toISOString().slice(0, 10),
      engine: rec.engine,
      status: rec.status,
      payload: rec.payload,
    },
  });
}
