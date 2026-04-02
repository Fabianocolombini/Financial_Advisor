import { readFileSync } from "fs";
import { join } from "path";

/** Entrada do `macro_series.json` (campos extra como `tier` são ignorados pelo ingest). */
export type MacroSeriesSpec = {
  external_id: string;
  title?: string;
  tier?: string;
  category?: string;
};

/** Lê o manifesto core partilhado com o job Python (`analytics/qi/data/macro_series.json`). */
export function loadMacroManifest(): MacroSeriesSpec[] {
  const p = join(process.cwd(), "analytics", "qi", "data", "macro_series.json");
  const raw = readFileSync(p, "utf-8");
  const data = JSON.parse(raw) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("macro_series.json must be a JSON array");
  }
  return data as MacroSeriesSpec[];
}
