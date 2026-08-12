import { unauthorizedCronResponse } from "@/lib/cron-auth";
import { runWalletDailyAlerts } from "@/lib/wallet/run-daily-alerts";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * After the US close: compute stay/add/leave for every holding and notify.
 * Local: curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/wallet-alerts
 */
export async function GET(request: Request) {
  const denied = unauthorizedCronResponse(request);
  if (denied) return denied;

  const result = await runWalletDailyAlerts();
  return NextResponse.json({ ok: true, ...result });
}
