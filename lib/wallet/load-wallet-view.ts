import { prisma } from "@/lib/prisma";
import { fetchYahooQuoteSummaryCached } from "@/lib/market/yahoo-quote";
import { loadMotorDashboardSnapshot } from "@/lib/motor/load-snapshot";
import {
  evaluateWalletPosition,
} from "./position-status";
import type { WalletAlertView, WalletHoldingView } from "./types";

export type { WalletAlertView, WalletHoldingView } from "./types";

function toNum(value: { toNumber(): number } | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : value.toNumber();
  return Number.isFinite(n) ? n : null;
}

export async function loadWalletView(userId: string): Promise<{
  holdings: WalletHoldingView[];
  alert: WalletAlertView | null;
}> {
  const [rows, snapshot, latestAlert] = await Promise.all([
    prisma.walletHolding.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    }),
    loadMotorDashboardSnapshot(),
    prisma.walletAlert.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const quotes = await Promise.all(
    rows.map((row) => fetchYahooQuoteSummaryCached(row.symbol)),
  );

  const holdings: WalletHoldingView[] = rows.map((row, i) => {
    const quote = quotes[i];
    const tick = snapshot?.tickers[row.symbol.toUpperCase()];
    const klass = snapshot?.classes[row.classId];
    const quantity = toNum(row.quantity) ?? 0;
    const costPrice = toNum(row.costPrice) ?? 0;
    const status = evaluateWalletPosition({
      price: quote?.price ?? null,
      costPrice,
      quantity,
      targetMin: toNum(row.targetMin),
      targetMax: toNum(row.targetMax),
      allocation: tick?.allocationAction ?? klass?.allocationAction ?? tick?.stageLabel ?? klass?.stageLabel ?? null,
      instrumentQuality: tick?.instrumentQuality ?? null,
      entryTiming: tick?.entryTiming ?? null,
    });

    return {
      id: row.id,
      symbol: row.symbol,
      classId: row.classId,
      name: row.name,
      exchange: row.exchange,
      kind: row.kind,
      quantity,
      costPrice,
      purchasedAt: row.purchasedAt.toISOString(),
      targetMin: toNum(row.targetMin),
      targetMax: toNum(row.targetMax),
      notes: row.notes,
      last: quote?.price ?? null,
      changePercent: quote?.changePercent ?? null,
      currency: quote?.currency ?? "USD",
      status,
    };
  });

  const alert: WalletAlertView | null = latestAlert
    ? {
        id: latestAlert.id,
        createdAt: latestAlert.createdAt.toISOString(),
        read: latestAlert.readAt != null,
        items: Array.isArray((latestAlert.payload as { items?: unknown }).items)
          ? ((latestAlert.payload as { items: WalletAlertView["items"] }).items ?? [])
          : [],
      }
    : null;

  return { holdings, alert };
}
