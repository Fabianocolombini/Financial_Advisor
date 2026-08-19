import { requireSession } from "@/lib/api-auth";
import { composeHomingEmail } from "@/lib/homing/homing-email";
import { homingAppUrl, loadHomingView } from "@/lib/homing/load-homing";
import { hasDeliverableEmail } from "@/lib/homing/digest-mail";
import { prisma } from "@/lib/prisma";
import { writeRateLimitOr429 } from "@/lib/rate-limit";
import {
  sendWalletAlertEmail,
  walletEmailConfigured,
} from "@/lib/wallet/send-alert-email";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      email: true,
      dailyDigestEmail: true,
      walletAlerts: {
        where: { emailedAt: { not: null } },
        orderBy: { emailedAt: "desc" },
        take: 1,
        select: { emailedAt: true },
      },
    },
  });

  return NextResponse.json({
    data: {
      email: user?.email ?? null,
      enabled: user?.dailyDigestEmail ?? false,
      lastEmailedAt: user?.walletAlerts[0]?.emailedAt?.toISOString() ?? null,
      emailConfigured: walletEmailConfigured(),
    },
  });
}

export async function POST(request: Request) {
  const rl = writeRateLimitOr429(request);
  if (rl) return rl;

  const session = await requireSession();
  if (!session.ok) return session.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action =
    body && typeof body === "object" && "action" in body
      ? String((body as { action: unknown }).action)
      : "";

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, dailyDigestEmail: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (action === "enable" || action === "disable") {
    const enabled = action === "enable";
    if (enabled && !hasDeliverableEmail(user.email)) {
      return NextResponse.json(
        { error: "This account has no email. Sign in with Google." },
        { status: 400 },
      );
    }
    await prisma.user.update({
      where: { id: session.userId },
      data: {
        dailyDigestEmail: enabled,
        dailyDigestEmailAt: enabled ? new Date() : null,
      },
    });
    return NextResponse.json({
      data: { enabled, email: user.email },
    });
  }

  if (action === "test") {
    if (!user.dailyDigestEmail) {
      return NextResponse.json(
        { error: "Allow Daily Digest first." },
        { status: 400 },
      );
    }
    if (!hasDeliverableEmail(user.email)) {
      return NextResponse.json(
        { error: "This account has no email. Sign in with Google." },
        { status: 400 },
      );
    }
    const { view } = await loadHomingView(session.userId);
    const mail = composeHomingEmail({
      view,
      walletUrl: homingAppUrl(),
    });
    const sent = await sendWalletAlertEmail({
      to: user.email!,
      subject: `Test — ${mail.subject}`,
      text: mail.text,
      html: mail.html,
    });
    if (!sent.sent) {
      return NextResponse.json(
        {
          error:
            "The mail provider refused the send. The From domain in Resend must be Verified, and WALLET_ALERT_FROM must use that exact domain.",
          detail: sent.error?.slice(0, 240) ?? null,
        },
        { status: 502 },
      );
    }
    await prisma.walletAlert.create({
      data: {
        userId: session.userId,
        payload: { items: view.decisionItems, test: true },
        emailedAt: new Date(),
      },
    });
    return NextResponse.json({ data: { sent: true } });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
