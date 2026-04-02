import { NextResponse } from "next/server";

/**
 * Por defeito, motores QI em TypeScript **não** gravam em `qi_*` — a fonte de verdade
 * é Python (`analytics/qi`: ingest Polygon + `run_analysis`). Evita duplicar regime /
 * setores / recomendações no mesmo `as_of`.
 *
 * Para reactivar escritores TS (ex.: dev): `QI_ALLOW_TS_QI_WRITERS=true`.
 */
export function tsQiWritersBlockedResponse(): NextResponse | null {
  if (process.env.QI_ALLOW_TS_QI_WRITERS === "true") {
    return null;
  }
  return NextResponse.json({
    ok: true,
    skipped: true,
    reason:
      "Escritores QI em TS desactivados por defeito; use Python (run_analysis / qi-pipeline). Defina QI_ALLOW_TS_QI_WRITERS=true para permitir.",
  });
}
