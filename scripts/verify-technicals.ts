/**
 * Compares the indicator engine against reference values from a charting platform.
 *
 *   npx tsx scripts/verify-technicals.ts SPY
 *
 * Reference values are the ones observed for SPY at close on 2026-08-10. They are
 * only meaningful for that date; pass a different symbol to just print the table.
 */

import { fetchYahooChart } from "@/lib/market/yahoo";
import { computeTechnicalAnalysis } from "@/lib/market/technical-summary";
import { buildPivotTable, PIVOT_LEVEL_ORDER } from "@/lib/market/pivot-points";

const REFERENCE: Record<string, { value: number; action: string }> = {
  rsi_14: { value: 63.34, action: "Neutral" },
  stoch_k: { value: 90.44, action: "Neutral" },
  cci_20: { value: 109.28, action: "Sell" },
  adx_14: { value: 22.63, action: "Neutral" },
  awesome: { value: 23.19, action: "Neutral" },
  momentum_10: { value: 29.7, action: "Sell" },
  macd: { value: 7.31, action: "Buy" },
  stoch_rsi: { value: 96.39, action: "Neutral" },
  williams_r: { value: -13.17, action: "Sell" },
  bull_bear_power: { value: 22.47, action: "Neutral" },
  ultimate: { value: 58.78, action: "Neutral" },
  ema_10: { value: 763.32, action: "Buy" },
  sma_10: { value: 760.24, action: "Buy" },
  ema_20: { value: 756.55, action: "Buy" },
  sma_20: { value: 752.3, action: "Buy" },
  ema_30: { value: 752.81, action: "Buy" },
  sma_30: { value: 751.18, action: "Buy" },
  ema_50: { value: 746.48, action: "Buy" },
  sma_50: { value: 747.84, action: "Buy" },
  ema_100: { value: 731.18, action: "Buy" },
  sma_100: { value: 725.74, action: "Buy" },
  ema_200: { value: 705.62, action: "Buy" },
  sma_200: { value: 703.99, action: "Buy" },
  ichimoku_base: { value: 752.98, action: "Neutral" },
  vwma_20: { value: 751.26, action: "Buy" },
  hull_ma_9: { value: 776.36, action: "Sell" },
};

async function main() {
  const symbol = (process.argv[2] ?? "SPY").toUpperCase();
  const end = Math.floor(Date.now() / 1000);
  const start = end - 60 * 60 * 24 * 365 * 3;
  const { bars } = await fetchYahooChart(symbol, start, end, 0);

  const { rows } = computeTechnicalAnalysis(bars);
  const last = bars[bars.length - 1]!;

  console.log(
    `\n${symbol}  bars=${bars.length}  last=${last.date}  close=${last.value.toFixed(2)}\n`,
  );
  console.log(
    "indicator".padEnd(22) +
      "computed".padStart(12) +
      "reference".padStart(12) +
      "  diff".padEnd(10) +
      "action".padStart(9) +
      "  ref",
  );
  console.log("-".repeat(84));

  let valueMismatches = 0;
  let actionMismatches = 0;

  for (const row of rows) {
    const ref = REFERENCE[row.id];
    const computed = row.value;
    const diff =
      ref && computed != null ? Math.abs(computed - ref.value) : null;
    // Tolerance scales with magnitude: price-level MAs need more room than a 0-100 oscillator.
    const tolerance = ref ? Math.max(0.05, Math.abs(ref.value) * 0.002) : 0;
    const valueOk = diff == null ? true : diff <= tolerance;
    const actionOk = !ref || ref.action === row.action;
    if (ref && !valueOk) valueMismatches += 1;
    if (ref && !actionOk) actionMismatches += 1;

    console.log(
      row.id.padEnd(22) +
        (computed == null ? "—" : computed.toFixed(2)).padStart(12) +
        (ref ? ref.value.toFixed(2) : "—").padStart(12) +
        (diff == null ? "" : `  ${valueOk ? " " : "!"}${diff.toFixed(2)}`).padEnd(10) +
        row.action.padStart(9) +
        `  ${ref?.action ?? "—"}${actionOk ? "" : "  <-- MISMATCH"}`,
    );
  }

  console.log(
    `\nvalues off: ${valueMismatches}   actions off: ${actionMismatches}   (of ${Object.keys(REFERENCE).length} referenced)`,
  );

  const pivots = buildPivotTable(bars, "daily");
  if (pivots) {
    console.log(
      `\nPivôs (${pivots.source.from} → ${pivots.source.to})  O=${pivots.source.open.toFixed(2)} H=${pivots.source.high.toFixed(2)} L=${pivots.source.low.toFixed(2)} C=${pivots.source.close.toFixed(2)}`,
    );
    console.log(
      "level".padEnd(7) + pivots.sets.map((s) => s.method.padStart(12)).join(""),
    );
    for (const level of PIVOT_LEVEL_ORDER) {
      console.log(
        level.padEnd(7) +
          pivots.sets
            .map((s) => {
              const v = s.levels[level];
              return (v == null ? "—" : v.toFixed(2)).padStart(12);
            })
            .join(""),
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
