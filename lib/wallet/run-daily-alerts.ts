import { prisma } from "@/lib/prisma";
import { composeHomingEmail } from "@/lib/homing/homing-email";
import { homingAppUrl, loadHomingView } from "@/lib/homing/load-homing";
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
  emailErrors: string[];
}> {
  const [walletUsers, watchUsers] = await Promise.all([
    prisma.walletHolding.findMany({ distinct: ["userId"], select: { userId: true } }),
    prisma.userWatchlistItem.findMany({
      distinct: ["userId"],
      select: { userId: true },
    }),
  ]);
  const userIds = [
    ...new Set([...walletUsers, ...watchUsers].map((row) => row.userId)),
  ];

  let alerts = 0;
  let emailed = 0;
  let skippedRecent = 0;
  let skippedNoEmail = 0;
  const emailErrors: string[] = [];
  const since = new Date(Date.now() - RECENT_MS);
  const homingUrl = homingAppUrl();
  const emailConfigured = walletEmailConfigured();

  for (const userId of userIds) {
    const already = await prisma.walletAlert.findFirst({
      where: { userId, emailedAt: { gte: since } },
    });
    if (already) {
      skippedRecent += 1;
      continue;
    }

    const { view } = await loadHomingView(userId);

    const row = await prisma.walletAlert.create({
      data: { userId, payload: { items: view.decisionItems } },
    });
    if (view.decisionItems.length > 0) alerts += 1;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user?.email) {
      skippedNoEmail += 1;
      continue;
    }

    const mail = composeHomingEmail({
      view,
      walletUrl: homingUrl,
    });
    const sent = await sendWalletAlertEmail({
      to: user.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    if (sent.sent) {
      await prisma.walletAlert.update({
        where: { id: row.id },
        data: { emailedAt: new Date() },
      });
      emailed += 1;
    } else if (sent.error && emailErrors.length < 5) {
      emailErrors.push(sent.error);
    }
  }

  return {
    users: userIds.length,
    alerts,
    emailed,
    skippedRecent,
    skippedNoEmail,
    emailConfigured,
    emailErrors,
  };
}
