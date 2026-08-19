import { HomingView } from "@/components/homing/HomingView";
import { loadHomingView } from "@/lib/homing/load-homing";
import { prisma } from "@/lib/prisma";
import { getServerUserId } from "@/lib/server-user";
import { walletEmailConfigured } from "@/lib/wallet/send-alert-email";

export const dynamic = "force-dynamic";

export default async function HomingPage() {
  const userId = await getServerUserId();
  if (!userId) return null;

  const [{ view, snapshot }, user] = await Promise.all([
    loadHomingView(userId),
    prisma.user.findUnique({
      where: { id: userId },
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
    }),
  ]);

  return (
    <HomingView
      view={view}
      snapshot={snapshot}
      mail={{
        email: user?.email ?? null,
        enabled: user?.dailyDigestEmail ?? false,
        lastEmailedAt: user?.walletAlerts[0]?.emailedAt?.toISOString() ?? null,
        emailConfigured: walletEmailConfigured(),
      }}
    />
  );
}
