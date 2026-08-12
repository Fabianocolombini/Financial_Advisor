import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { writeRateLimitOr429 } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const rl = writeRateLimitOr429(request);
  if (rl) return rl;

  const session = await requireSession();
  if (!session.ok) return session.response;

  await prisma.walletAlert.updateMany({
    where: { userId: session.userId, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
