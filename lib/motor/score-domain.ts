/**
 * Score domains per asset class.
 *
 * The motor emits two incompatible score scales:
 * - `unit`: cross-sectional percentile rank in [0, 1] (two-layer regime + security models).
 *   0.5 means "median instrument among peers", never "neutral direction".
 * - `signed`: legacy z-score composite in [-1, +1], where the sign is directional.
 *
 * Reading a `unit` score on a signed axis is what produced "Buy gauge + Hold
 * recommendation" for cash instruments, so every consumer must resolve the domain
 * before mapping a score to any Buy/Sell language.
 */

export type ScoreDomain = "unit" | "signed";

export type ClassScoreProfile = {
  domain: ScoreDomain;
  /** Security-layer thresholds (cross-sectional rank) used by the motor. */
  security: { strong: number; weak: number };
  /** Regime-layer thresholds (allocation) used by the motor. */
  regime: { overweight: number; hold: number; reduce: number };
  /**
   * True when instrument prices are NAV-flat by design (cash-like), so momentum
   * oscillators and price-extension targets are not meaningful.
   */
  stabilityFocused: boolean;
  /**
   * How many security-layer indicators the motor is expected to persist. The
   * two-layer models are deliberately parsimonious (cash persists exactly three),
   * so a flat threshold of four would penalize them for working as designed.
   */
  minSecurityIndicators: number;
};

const TWO_LAYER_DEFAULT: ClassScoreProfile = {
  domain: "unit",
  security: { strong: 0.65, weak: 0.25 },
  regime: { overweight: 0.65, hold: 0.45, reduce: 0.25 },
  stabilityFocused: false,
  minSecurityIndicators: 3,
};

const SIGNED_DEFAULT: ClassScoreProfile = {
  domain: "signed",
  security: { strong: 0.3, weak: -0.3 },
  regime: { overweight: 0.3, hold: -0.3, reduce: -0.6 },
  stabilityFocused: false,
  minSecurityIndicators: 4,
};

/** Classes scored by the two-layer regime + security models (motor class_model_registry). */
const TWO_LAYER_CLASSES = [
  "cash_equivalents",
  "fi_treasury",
  "fi_ig",
  "fi_hy",
  "fi_tips",
  "fi_preferred",
  "us_equity",
  "intl_equity",
  "em_equity",
  "real_estate",
  "commodities_precious",
  "commodities_energy",
  "energy_mlp",
  "healthcare_biotech",
  "alt_bdc",
  "alt_infrastructure",
  "currencies",
] as const;

const CLASS_PROFILES: Record<string, ClassScoreProfile> = {
  ...Object.fromEntries(TWO_LAYER_CLASSES.map((id) => [id, TWO_LAYER_DEFAULT])),
  cash_equivalents: { ...TWO_LAYER_DEFAULT, stabilityFocused: true },
};

export function classScoreProfile(classId: string | null | undefined): ClassScoreProfile {
  if (!classId) return SIGNED_DEFAULT;
  return CLASS_PROFILES[classId] ?? SIGNED_DEFAULT;
}

export function scoreDomainForClass(classId: string | null | undefined): ScoreDomain {
  return classScoreProfile(classId).domain;
}

export function isStabilityFocusedClass(classId: string | null | undefined): boolean {
  return classScoreProfile(classId).stabilityFocused;
}

/**
 * Median of a `unit` domain — the point where an instrument is neither better nor
 * worse than its peers. Meaningless for `signed` scores, where 0 is neutral.
 */
export function neutralScore(classId: string | null | undefined): number {
  return scoreDomainForClass(classId) === "unit" ? 0.5 : 0;
}
