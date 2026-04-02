import { prisma } from "@/lib/prisma";

const DEV_EMAIL = "dev@local.financial-advisor";

/** Usuário único quando AUTH_ENABLED não está ativo; dados ficam isolados por userId. */
export async function getOrCreateDevUserId(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: DEV_EMAIL },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.user.create({
    data: {
      email: DEV_EMAIL,
      name: "Modo local",
    },
    select: { id: true },
  });
  return created.id;
}
