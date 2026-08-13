import { scoreDomainForClass } from "./score-domain";

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

/* ------------------------------------------------------------------ *
 * Class-aware gauge scales
 * ------------------------------------------------------------------ */

export type GaugeBand = {
  label: string;
  min: number;
  max: number;
  color: string;
  textClass: string;
};

export type GaugeScale = {
  id: "signed_directional" | "unit_quality";
  /** Title of what the needle actually measures. */
  title: string;
  /** One-line explanation of the axis, so the reading cannot be misread. */
  caption: string;
  domainMin: number;
  domainMax: number;
  bands: GaugeBand[];
};

export const SIGNED_DIRECTIONAL_SCALE: GaugeScale = {
  id: "signed_directional",
  title: "Motor directional signal",
  caption:
    "Scale −1 (Strong Sell) to +1 (Strong Buy): the signal indicates expected direction.",
  domainMin: -1,
  domainMax: 1,
  bands: GAUGE_ZONES.map((z) => ({
    label: z.zone,
    min: z.min,
    max: z.max,
    color: z.color,
    textClass: z.textClass,
  })),
};

/**
 * Percentile-rank axis for the two-layer models. Bands follow the motor's own
 * security thresholds (0.25 fraco / 0.65 forte), so the reading answers
 * "how good is this instrument versus its peers", not "buy or sell".
 */
export const UNIT_QUALITY_SCALE: GaugeScale = {
  id: "unit_quality",
  title: "Instrument quality vs peers",
  caption:
    "Scale 0 to 1: cross-sectional ranking inside this class. It does not indicate buy or sell.",
  domainMin: 0,
  domainMax: 1,
  bands: [
    { label: "Weak", min: 0, max: 0.25, color: "#dc2626", textClass: "text-red-500" },
    { label: "Below peers", min: 0.25, max: 0.45, color: "#f87171", textClass: "text-red-400" },
    { label: "In line", min: 0.45, max: 0.65, color: "#71717a", textClass: "text-zinc-400" },
    { label: "Competitive", min: 0.65, max: 0.85, color: "#4ade80", textClass: "text-emerald-400" },
    { label: "Preferred", min: 0.85, max: 1, color: "#16a34a", textClass: "text-emerald-500" },
  ],
};

export function gaugeScaleForClass(classId: string | null | undefined): GaugeScale {
  return scoreDomainForClass(classId) === "unit"
    ? UNIT_QUALITY_SCALE
    : SIGNED_DIRECTIONAL_SCALE;
}

/** Buy/Sell/Neutral tally mapped onto the same −1…+1 clock as the directional motor. */
export function technicalSignalScale(title: string, caption: string): GaugeScale {
  return { ...SIGNED_DIRECTIONAL_SCALE, title, caption };
}

export function clampToScale(scale: GaugeScale, value: number): number {
  if (!Number.isFinite(value)) {
    return (scale.domainMin + scale.domainMax) / 2;
  }
  return Math.max(scale.domainMin, Math.min(scale.domainMax, value));
}

export function gaugeBandForValue(scale: GaugeScale, value: number): GaugeBand {
  const v = clampToScale(scale, value);
  for (const band of scale.bands) {
    if (v >= band.min && (v < band.max || band.max === scale.domainMax)) {
      return band;
    }
  }
  return scale.bands[Math.floor(scale.bands.length / 2)]!;
}

/** Maps any scale domain onto the -90…+90 degree sweep of the gauge. */
export function needleDegreesForScale(scale: GaugeScale, value: number): number {
  const span = scale.domainMax - scale.domainMin;
  if (span <= 0) return 0;
  const ratio = (clampToScale(scale, value) - scale.domainMin) / span;
  return (ratio * 2 - 1) * 90;
}

/** Fraction 0…1 of where a value sits on the scale, for band arc rendering. */
export function scaleFraction(scale: GaugeScale, value: number): number {
  const span = scale.domainMax - scale.domainMin;
  if (span <= 0) return 0.5;
  return (clampToScale(scale, value) - scale.domainMin) / span;
}
