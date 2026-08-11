export type GaugeZone =
  | "Strong Sell"
  | "Sell"
  | "Neutral"
  | "Buy"
  | "Strong Buy";

export const GAUGE_ZONES: {
  zone: GaugeZone;
  min: number;
  max: number;
  color: string;
  textClass: string;
}[] = [
  { zone: "Strong Sell", min: -1, max: -0.5, color: "#dc2626", textClass: "text-red-500" },
  { zone: "Sell", min: -0.5, max: -0.1, color: "#f87171", textClass: "text-red-400" },
  { zone: "Neutral", min: -0.1, max: 0.1, color: "#71717a", textClass: "text-zinc-400" },
  { zone: "Buy", min: 0.1, max: 0.5, color: "#4ade80", textClass: "text-emerald-400" },
  { zone: "Strong Buy", min: 0.5, max: 1, color: "#16a34a", textClass: "text-emerald-500" },
];

export function clampGaugeValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function gaugeZoneForValue(value: number): GaugeZone {
  const v = clampGaugeValue(value);
  for (const z of GAUGE_ZONES) {
    if (v >= z.min && (v < z.max || (z.max === 1 && v <= 1))) return z.zone;
  }
  return "Neutral";
}

/** Maps -1…+1 to needle rotation in degrees (-90 = left, +90 = right). */
export function gaugeNeedleDegrees(value: number): number {
  return clampGaugeValue(value) * 90;
}
