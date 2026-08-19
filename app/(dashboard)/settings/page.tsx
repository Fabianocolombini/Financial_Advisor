import { DigestMailCard } from "@/components/settings/DigestMailCard";
import { prisma } from "@/lib/prisma";
import { getServerUserId } from "@/lib/server-user";
import { walletEmailConfigured } from "@/lib/wallet/send-alert-email";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await getServerUserId();
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
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

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-2">
        <h1 className="font-title text-2xl tracking-tight text-white">Profile</h1>
        <p className="font-body text-sm text-zinc-400">
          Login and mail preferences. Daily Digest itself stays on the home
          screen.
        </p>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
          Account
        </p>
        <p className="mt-2 text-sm text-white">{user?.name ?? "—"}</p>
        <p className="text-sm text-zinc-400">{user?.email ?? "No email on this login"}</p>
      </section>

      <DigestMailCard
        initial={{
          email: user?.email ?? null,
          enabled: user?.dailyDigestEmail ?? false,
          lastEmailedAt: user?.walletAlerts[0]?.emailedAt?.toISOString() ?? null,
          emailConfigured: walletEmailConfigured(),
        }}
      />
    </div>
  );
}
