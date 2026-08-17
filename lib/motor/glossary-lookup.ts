import glossary from "@/lib/motor/indicator-glossary.json";

export type GlossaryEntry = string | { meaning: string; read: string };

const ALIASES: Record<string, string> = {
  rsi_14: "rsi",
  stoch_k: "stochastic_fast",
  cci_20: "cci",
  adx_14: "adx",
  awesome: "awesome_oscillator",
  momentum_10: "momentum",
  macd: "macd_level",
  stoch_rsi: "stochastic_rsi",
  williams_r: "williams_r",
  bull_bear_power: "bull_bear_power",
  ultimate: "ultimate_oscillator",
  ichimoku_base: "ichimoku",
  vwma_20: "vwma",
  hull_ma_9: "hull_ma",
  real_yield_10y: "yield_real_10y",
  hy_spread: "hy_oas",
  loan_officer: "sloos",
  preco_vs_mm50_abs: "preco_vs_mm50",
  liquidez: "volume_vs_media",
  vol_penalty_inv: "vol_realizada",
  nav_premium_discount: "nav_discount",
  nav_cheap: "nav_discount",
  non_accrual_rate: "non_accrual",
};

function isGlossaryKey(id: string): id is keyof typeof glossary {
  return Object.prototype.hasOwnProperty.call(glossary, id);
}

/** Resolve a motor or technical indicator id to a glossary key. */
export function glossaryTermForIndicator(id: string): string | null {
  if (isGlossaryKey(id)) return id;
  const aliased = ALIASES[id];
  if (aliased && isGlossaryKey(aliased)) return aliased;
  if (id.startsWith("sma_") || id.startsWith("ema_")) return "moving_averages";
  return null;
}

export function getGlossaryEntry(id: string): GlossaryEntry | null {
  const key = glossaryTermForIndicator(id);
  if (!key || !isGlossaryKey(key)) return null;
  return glossary[key] as GlossaryEntry;
}
