import { prisma } from "@/lib/prisma";

const DEV_EMAIL = "dev@local.financial-advisor";

/** Usuário único quando AUTH_ENABLED não está ativo; dados ficam isolados por userId. */
export async function getOrCreateDevUserId(): Promise<string> {
  // upsert é atómico — evita P2002 quando há pedidos paralelos (ex.: Strict Mode em dev).
  const user = await prisma.user.upsert({
    where: { email: DEV_EMAIL },
    create: {
      email: DEV_EMAIL,
      name: "Modo local",
    },
    update: {},
    select: { id: true },
  });
  return user.id;
}
