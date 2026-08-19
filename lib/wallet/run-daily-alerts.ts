import { prisma } from "@/lib/prisma";
import { composeHomingEmail } from "@/lib/homing/homing-email";
import { homingAppUrl, loadHomingView } from "@/lib/homing/load-homing";
import {
  hasDeliverableEmail,
  shouldSkipDigestSend,
} from "@/lib/homing/digest-mail";
import {
  sendWalletAlertEmail,
  walletEmailConfigured,
} from "@/lib/wallet/send-alert-email";

export async function runWalletDailyAlerts(): Promise<{
  users: number;
  alerts: number;
  emailed: number;
  skippedRecent: number;
  skippedNoEmail: number;
  emailConfigured: boolean;
  emailErrors: string[];
}> {
  const recipients = await prisma.user.findMany({
    where: { dailyDigestEmail: true },
    select: {
      id: true,
      email: true,
      walletAlerts: {
        where: { emailedAt: { not: null } },
        orderBy: { emailedAt: "desc" },
        take: 1,
        select: { emailedAt: true },
      },
    },
  });

  let alerts = 0;
  let emailed = 0;
  let skippedRecent = 0;
  let skippedNoEmail = 0;
  const emailErrors: string[] = [];
  const homingUrl = homingAppUrl();
  const emailConfigured = walletEmailConfigured();

  for (const user of recipients) {
    if (shouldSkipDigestSend(user.walletAlerts[0]?.emailedAt ?? null)) {
      skippedRecent += 1;
      continue;
    }

    const { view } = await loadHomingView(user.id);

    const row = await prisma.walletAlert.create({
      data: { userId: user.id, payload: { items: view.decisionItems } },
    });
    if (view.decisionItems.length > 0) alerts += 1;

    if (!hasDeliverableEmail(user.email)) {
      skippedNoEmail += 1;
      continue;
    }

    const mail = composeHomingEmail({
      view,
      walletUrl: homingUrl,
    });
    const sent = await sendWalletAlertEmail({
      to: user.email!,
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
    users: recipients.length,
    alerts,
    emailed,
    skippedRecent,
    skippedNoEmail,
    emailConfigured,
    emailErrors,
  };
}
