import { prisma } from "@/lib/prisma";
import { loadWalletView } from "@/lib/wallet/load-wallet-view";
import { actionNeedsAlert } from "@/lib/wallet/position-status";
import { sendWalletAlertEmail } from "@/lib/wallet/send-alert-email";

export async function runWalletDailyAlerts(): Promise<{
  users: number;
  alerts: number;
  emailed: number;
}> {
  const userIds = await prisma.walletHolding.findMany({
    distinct: ["userId"],
    select: { userId: true },
  });

  let alerts = 0;
  let emailed = 0;

  for (const { userId } of userIds) {
    const view = await loadWalletView(userId);
    const items = view.holdings
      .filter((h) => actionNeedsAlert(h.status.action.action))
      .map((h) => ({
        symbol: h.symbol,
        action: h.status.action.action,
        label: h.status.action.label,
        hint: h.status.action.hint,
        pnlPct: h.status.pnlPct,
      }));

    if (items.length === 0) continue;

    const row = await prisma.walletAlert.create({
      data: { userId, payload: { items } },
    });
    alerts += 1;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user?.email) continue;

    const lines = items.map((item) => {
      const pnl =
        item.pnlPct != null ? ` (${item.pnlPct >= 0 ? "+" : ""}${item.pnlPct.toFixed(1)}%)` : "";
      return `• ${item.symbol}: ${item.label}${pnl}\n  ${item.hint}`;
    });
    const sent = await sendWalletAlertEmail({
      to: user.email,
      subject: `My Wallet — ${items.length} decision${items.length === 1 ? "" : "s"} today`,
      text: `Names in your wallet that need a decision:\n\n${lines.join("\n\n")}\n\nOpen My Wallet in Atlas for the detail vs purchase price and the bands.`,
    });
    if (sent.sent) {
      await prisma.walletAlert.update({
        where: { id: row.id },
        data: { emailedAt: new Date() },
      });
      emailed += 1;
    }
  }

  return { users: userIds.length, alerts, emailed };
}
