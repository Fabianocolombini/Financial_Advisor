import { NextResponse } from "next/server";

/**
 * Valida `Authorization: Bearer $CRON_SECRET` (padrão Vercel Cron).
 * Retorna `NextResponse` 401 se inválido; `null` se autorizado.
 */
export function unauthorizedCronResponse(
  request: Request,
): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  return null;
}
