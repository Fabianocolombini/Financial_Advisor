import { fetchYahooChartCloses } from "@/lib/market/yahoo";
import type { CatalogInstrument } from "./types";

const LOOKBACK_DAYS = 21;
const CUMULATIVE_TARGET_PCT = 50;

function avgDollarVolume(bars: { value: number; volume: number }[]): number {
  const slice = bars.slice(-LOOKBACK_DAYS);
  let sum = 0;
  let n = 0;
  for (const bar of slice) {
    if (bar.volume > 0 && bar.value > 0) {
      sum += bar.value * bar.volume;
      n += 1;
    }
  }
  return n > 0 ? sum / n : 0;
}

async function dollarVolumeForSymbol(symbol: string): Promise<number> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - (LOOKBACK_DAYS + 10) * 86400;
  try {
    const bars = await fetchYahooChartCloses(symbol, period1, period2);
    return avgDollarVolume(bars);
  } catch {
    return 0;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 8,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return out;
}

export type RankedCatalogInstrument = CatalogInstrument & {
  liquiditySharePct: number;
  avgDollarVolume: number;
};

/**
 * Rank class instruments by average daily dollar volume (EOD).
 * Returns top names until cumulative share reaches 50% of class liquidity.
 */
export async function rankCatalogByVolume(
  instruments: CatalogInstrument[],
): Promise<RankedCatalogInstrument[]> {
  if (instruments.length === 0) return [];

  const volumes = await mapWithConcurrency(
    instruments,
    async (item) => ({
      item,
      avgDollarVolume: await dollarVolumeForSymbol(item.symbol),
    }),
  );

  const withVolume = volumes.filter((row) => row.avgDollarVolume > 0);
  if (withVolume.length === 0) {
    return instruments.slice(0, 12).map((item) => ({
      ...item,
      liquiditySharePct: 0,
      avgDollarVolume: 0,
    }));
  }

  const total = withVolume.reduce((sum, row) => sum + row.avgDollarVolume, 0);
  const sorted = [...withVolume].sort(
    (a, b) => b.avgDollarVolume - a.avgDollarVolume,
  );

  const ranked: RankedCatalogInstrument[] = [];
  let cumulative = 0;

  for (const row of sorted) {
    const sharePct = (row.avgDollarVolume / total) * 100;
    ranked.push({
      ...row.item,
      liquiditySharePct: sharePct,
      avgDollarVolume: row.avgDollarVolume,
    });
    cumulative += sharePct;
    if (cumulative >= CUMULATIVE_TARGET_PCT) break;
  }

  return ranked;
}
