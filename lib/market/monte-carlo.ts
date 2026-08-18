/**
 * Historical-bootstrap Monte Carlo for price ranges.
 *
 * The envelope forecast assumes a calibrated normal band. This model instead
 * resamples the name's own daily returns (last 252 sessions when available) and
 * walks them forward. Fat tails and skew in the real series show up in the
 * percentiles; there is no extra motor drift — that is the other model's job.
 *
 * Paths are seeded from the last bar's date so server and client render the
 * same numbers (no hydration mismatch, no flicker on refresh).
 */

export const MONTE_CARLO_PATHS = 2000;
const RETURN_WINDOW = 252;

export type MonteCarloHorizon = {
  id: string;
  days: number;
  label: string;
};

export const MONTE_CARLO_HORIZONS: MonteCarloHorizon[] = [
  { id: "5d", days: 5, label: "5 days" },
  { id: "15d", days: 15, label: "15 days" },
  { id: "21d", days: 21, label: "1 month" },
  { id: "63d", days: 63, label: "3 months" },
  { id: "126d", days: 126, label: "6 months" },
];

export type MonteCarloScenario = {
  horizon: string;
  horizonDays: number;
  label: string;
  median: number;
  mean: number;
  low68: number;
  high68: number;
  low95: number;
  high95: number;
  expectedReturnPct: number;
  probabilityUp: number;
  paths: number;
};

export type MonteCarloRun = {
  current: number;
  paths: number;
  returnSample: number;
  scenarios: MonteCarloScenario[];
  note: string;
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/**
 * Daily simple returns from a close series. Skips a zero previous close.
 */
export function simpleReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]!;
    if (!prev) continue;
    out.push((closes[i]! - prev) / prev);
  }
  return out;
}

export function runMonteCarlo(input: {
  closes: number[];
  asOf?: string | null;
  symbol?: string;
  horizons?: MonteCarloHorizon[];
  paths?: number;
}): MonteCarloRun | null {
  const closes = input.closes.filter((v) => Number.isFinite(v) && v > 0);
  if (closes.length < 40) return null;
  const current = closes[closes.length - 1]!;
  const allReturns = simpleReturns(closes);
  if (allReturns.length < 20) return null;

  const pool = allReturns.slice(-RETURN_WINDOW);
  const horizons = input.horizons ?? MONTE_CARLO_HORIZONS;
  const paths = input.paths ?? MONTE_CARLO_PATHS;
  const maxDays = Math.max(...horizons.map((h) => h.days));
  const rng = mulberry32(
    hashSeed(`${input.symbol ?? ""}|${input.asOf ?? ""}|${current.toFixed(6)}`),
  );

  const byHorizon = new Map<number, number[]>();
  for (const h of horizons) byHorizon.set(h.days, []);

  for (let p = 0; p < paths; p++) {
    let price = current;
    for (let t = 1; t <= maxDays; t++) {
      const r = pool[Math.floor(rng() * pool.length)]!;
      price *= 1 + r;
      const bucket = byHorizon.get(t);
      if (bucket) bucket.push(price);
    }
  }

  const scenarios: MonteCarloScenario[] = horizons.map((h) => {
    const sample = (byHorizon.get(h.days) ?? []).slice().sort((a, b) => a - b);
    const median = percentile(sample, 0.5);
    const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
    return {
      horizon: h.id,
      horizonDays: h.days,
      label: h.label,
      median,
      mean,
      low68: percentile(sample, 0.16),
      high68: percentile(sample, 0.84),
      low95: percentile(sample, 0.025),
      high95: percentile(sample, 0.975),
      expectedReturnPct: ((median / current - 1) * 100),
      probabilityUp: sample.filter((v) => v > current).length / sample.length,
      paths: sample.length,
    };
  });

  return {
    current,
    paths,
    returnSample: pool.length,
    scenarios,
    note:
      "Monte Carlo resamples this name's own daily returns (last 252 sessions when available). It is not a promise of return — a fat left tail in history stays in the 95% floor.",
  };
}

export function monteCarloForHorizon(
  run: MonteCarloRun | null,
  days: number,
): MonteCarloScenario | null {
  if (!run) return null;
  return run.scenarios.find((s) => s.horizonDays === days) ?? null;
}
