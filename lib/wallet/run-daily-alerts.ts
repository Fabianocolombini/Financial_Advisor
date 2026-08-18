import { prisma } from "@/lib/prisma";
import { composeWalletDigest, walletAppUrl } from "@/lib/wallet/daily-digest";
import { loadWalletView } from "@/lib/wallet/load-wallet-view";
import {
  sendWalletAlertEmail,
  walletEmailConfigured,
} from "@/lib/wallet/send-alert-email";

const RECENT_MS = 20 * 60 * 60 * 1000;

export async function runWalletDailyAlerts(): Promise<{
  users: number;
  alerts: number;
  emailed: number;
  skippedRecent: number;
  skippedNoEmail: number;
  emailConfigured: boolean;
}> {
  const userIds = await prisma.walletHolding.findMany({
    distinct: ["userId"],
    select: { userId: true },
  });

  let alerts = 0;
  let emailed = 0;
  let skippedRecent = 0;
  let skippedNoEmail = 0;
  const since = new Date(Date.now() - RECENT_MS);
  const walletUrl = walletAppUrl();
  const emailConfigured = walletEmailConfigured();

  for (const { userId } of userIds) {
    const already = await prisma.walletAlert.findFirst({
      where: { userId, emailedAt: { gte: since } },
    });
    if (already) {
      skippedRecent += 1;
      continue;
    }

    const view = await loadWalletView(userId);
    if (view.holdings.length === 0) continue;

    const digest = composeWalletDigest({
      holdings: view.holdings,
      walletUrl,
    });

    const row = await prisma.walletAlert.create({
      data: { userId, payload: { items: digest.decisionItems } },
    });
    if (digest.decisionItems.length > 0) alerts += 1;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user?.email) {
      skippedNoEmail += 1;
      continue;
    }

    const sent = await sendWalletAlertEmail({
      to: user.email,
      subject: digest.subject,
      text: digest.text,
      html: digest.html,
    });
    if (sent.sent) {
      await prisma.walletAlert.update({
        where: { id: row.id },
        data: { emailedAt: new Date() },
      });
      emailed += 1;
    }
  }

  return {
    users: userIds.length,
    alerts,
    emailed,
    skippedRecent,
    skippedNoEmail,
    emailConfigured,
  };
}
