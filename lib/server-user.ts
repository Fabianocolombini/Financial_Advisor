import { auth } from "@/auth";
import { authEnabled } from "@/lib/auth-mode";
import { getOrCreateDevUserId } from "@/lib/dev-user";

/** userId para server components; null só se AUTH_ENABLED e sem sessão. */
export async function getServerUserId(): Promise<string | null> {
  if (!authEnabled) {
    return getOrCreateDevUserId();
  }
  const session = await auth();
  return session?.user?.id ?? null;
}
