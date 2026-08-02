/**
 * Export catalog symbols per classId for motor top-90% liquidity scoring.
 * Output: motor/config/catalog_by_class.json
 */
import { writeFileSync } from "fs";
import path from "path";
import { CATALOG_INSTRUMENTS } from "../lib/catalog/instruments";

const byClass: Record<string, { symbol: string; name: string }[]> = {};

for (const item of CATALOG_INSTRUMENTS) {
  const list = byClass[item.classId] ?? [];
  list.push({ symbol: item.symbol.toUpperCase(), name: item.name });
  byClass[item.classId] = list;
}

const out = path.join(process.cwd(), "motor/config/catalog_by_class.json");
writeFileSync(out, JSON.stringify({ version: 1, classes: byClass }, null, 2));
console.log(`[export-catalog] ${Object.keys(byClass).length} classes → ${out}`);
