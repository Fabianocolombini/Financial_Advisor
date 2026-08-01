import { unauthorizedCronResponse } from "@/lib/cron-auth";
import { tsQiWritersBlockedResponse } from "@/lib/qi/ts-qi-writers-guard";
import { runQiRecommendation } from "@/lib/qi/optimizer";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * CRON desativado em produção (removido de vercel.json).
 * Motor analítico QI corre via Python (`run_analysis.py`) no host dedicado.
 * Para reativar escritas TS: `QI_ALLOW_TS_QI_WRITERS=true` + voltar a agendar no vercel.json.
 * Invocação manual: GET /api/cron/qi-recommend com Authorization: Bearer CRON_SECRET
 *
 * Gera `QiRecommendation` a partir dos últimos snapshots.
 * Auth: `Authorization: Bearer $CRON_SECRET`
 */
export async function GET(request: Request) {
  const denied = unauthorizedCronResponse(request);
  if (denied) return denied;

  const blocked = tsQiWritersBlockedResponse();
  if (blocked) return blocked;

  try {
    const result = await runQiRecommendation(new Date());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
