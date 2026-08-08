/** Compact share volume for tables (K = mil, M = milhão, B = bilhão). */
export function formatShareVolumeCompact(shares: number | null | undefined): string {
  if (shares == null || !Number.isFinite(shares) || shares <= 0) return "—";
  if (shares >= 1e9) {
    const v = shares / 1e9;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}B`;
  }
  if (shares >= 1e6) {
    const v = shares / 1e6;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (shares >= 1e3) {
    const v = shares / 1e3;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}K`;
  }
  return String(Math.round(shares));
}

/** USD amounts with T/B/M suffix (e.g. market cap). */
export function formatUsdCompact(
  usd: number | null | undefined,
  options?: { suffix?: string },
): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  const suffix = options?.suffix ?? " USD";
  const abs = Math.abs(usd);
  if (abs >= 1e12) {
    const v = usd / 1e12;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(2)} T${suffix}`;
  }
  if (abs >= 1e9) {
    const v = usd / 1e9;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(2)} B${suffix}`;
  }
  if (abs >= 1e6) {
    const v = usd / 1e6;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(2)} M${suffix}`;
  }
  if (abs >= 1e3) {
    const v = usd / 1e3;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(2)} K${suffix}`;
  }
  return `${usd.toFixed(2)}${suffix}`;
}

export function formatPrice(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (usd >= 1000) return usd.toFixed(2);
  if (usd >= 1) return usd.toFixed(2);
  return usd.toFixed(4);
}

export function formatPerf(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function perfClass(pct: number | null | undefined): string {
  if (pct == null) return "text-zinc-500";
  if (pct > 0) return "text-emerald-400";
  if (pct < 0) return "text-red-400";
  return "text-zinc-400";
}

export function formatChangeAbs(
  change: number | null | undefined,
  currency = "USD",
): string {
  if (change == null || !Number.isFinite(change)) return "—";
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(2)} ${currency}`;
}
