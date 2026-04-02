import { auth } from "@/auth";
import { authEnabled } from "@/lib/auth-mode";
import { getOrCreateDevUserId } from "@/lib/dev-user";
import { NextResponse } from "next/server";

export async function requireSession(): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }
> {
  if (!authEnabled) {
    const userId = await getOrCreateDevUserId();
    return { ok: true, userId };
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Não autenticado" }, { status: 401 }),
    };
  }
  return { ok: true, userId };
}
