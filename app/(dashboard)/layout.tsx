import { AppShell } from "@/components/layout/AppShell";
import { auth } from "@/auth";
import { authEnabled } from "@/lib/auth-mode";
import { getOrCreateDevUserId } from "@/lib/dev-user";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (authEnabled) {
    const session = await auth();
    if (!session?.user) {
      redirect("/auth/signin");
    }
    return (
      <AppShell user={session.user} showSignOut>
        {children}
      </AppShell>
    );
  }

  const devId = await getOrCreateDevUserId();
  const row = await prisma.user.findUnique({
    where: { id: devId },
    select: { name: true, email: true },
  });

  return (
    <AppShell
      user={{
        name: row?.name ?? "Modo local",
        email: row?.email,
      }}
    >
      {children}
    </AppShell>
  );
}
