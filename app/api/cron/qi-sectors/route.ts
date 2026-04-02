import { tsQiWritersBlockedResponse } from "@/lib/qi/ts-qi-writers-guard";
import { runAssetSelection } from "@/lib/qi/asset-selection";
import { runSectorRotation } from "@/lib/qi/sector-rotation";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Rotação sectorial + scoring de ativos (snapshots).
 * Auth: `Authorization: Bearer $CRON_SECRET`
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const blocked = tsQiWritersBlockedResponse();
  if (blocked) return blocked;

  const asOf = new Date();
  try {
    const sectors = await runSectorRotation(asOf);
    const assets = await runAssetSelection(asOf);
    return NextResponse.json({
      ok: true,
      sectors,
      assets,
    });
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
