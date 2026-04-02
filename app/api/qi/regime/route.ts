import { requireSession } from "@/lib/api-auth";
import { QI_MODEL_VERSION } from "@/lib/qi/constants";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const [macro, risk] = await Promise.all([
    prisma.qiRegimeSnapshot.findFirst({
      where: { kind: "MACRO", modelVersion: QI_MODEL_VERSION },
      orderBy: { asOfDate: "desc" },
    }),
    prisma.qiRegimeSnapshot.findFirst({
      where: { kind: "RISK", modelVersion: QI_MODEL_VERSION },
      orderBy: { asOfDate: "desc" },
    }),
  ]);

  return NextResponse.json({
    modelVersion: QI_MODEL_VERSION,
    macro: macro
      ? {
          asOfDate: macro.asOfDate.toISOString().slice(0, 10),
          regimeLabel: macro.regimeLabel,
          compositeScore: macro.compositeScore?.toString() ?? null,
          components: macro.components,
        }
      : null,
    risk: risk
      ? {
          asOfDate: risk.asOfDate.toISOString().slice(0, 10),
          regimeLabel: risk.regimeLabel,
          components: risk.components,
        }
      : null,
  });
}
