/**
 * What the score of each asset class is actually made of.
 *
 * The score is not an absolute measure of how good an investment is. It is a
 * ranking *inside one class*: each ingredient below is turned into a position
 * relative to the peers scored on the same day (0 = worst of the group, 1 = best),
 * and the score is the weighted average of those positions. A 0.62 in Cash and a
 * 0.62 in US Equity therefore say the same thing about the peer group and nothing
 * about which of the two sleeves to prefer.
 *
 * Weights mirror `motor/config/models/*_regime.json`; ingredient descriptions
 * mirror the corresponding `motor/src/calculo/*_security_score.py`.
 */

export type ScoreIngredient = {
  label: string;
  weight: number;
  /** Explains the direction: what counts as good for this ingredient. */
  meaning: string;
};

export type ScoreRecipe = {
  headline: string;
  ingredients: ScoreIngredient[];
  /** Extra line after the generic percentile footnote (class-specific caveats). */
  note?: string;
};

const RECIPES: Record<string, ScoreRecipe> = {
  cash_equivalents: {
    headline:
      "In cash the score measures which name holds money better — not which will yield more. RSI is left out on purpose: a slow upward drift from accrued yield is not momentum.",
    ingredients: [
      {
        label: "Traded volume",
        weight: 0.5,
        meaning:
          "raw shares traded that day vs peers — higher is better: you can enter and exit without moving the price",
      },
      {
        label: "20-day volatility",
        weight: 0.35,
        meaning:
          "how much the price swung in the last 20 sessions — lower is better: cash should not bounce around",
      },
      {
        label: "Distance from the 50-day average (z-score)",
        weight: 0.15,
        meaning:
          "gap vs the 50-day average, divided by that name's own 50-day price noise — a small gap is better. A fund that is simply drifting up with yield is not penalized; a real dislocation is",
      },
    ],
  },
  fi_treasury: {
    headline:
      "In Treasuries the score ranks the point on the curve with the best rate-risk-adjusted momentum and liquidity — not which maturity is “safer”. RSI is kept on purpose: the curve has genuine rate-reversal cycles, unlike Cash.",
    ingredients: [
      {
        label: "Price trend / duration",
        weight: 0.35,
        meaning:
          "price vs the 50- and 200-day averages, each divided by modified duration so a 30-year fund is not ranked higher just because it moves more for the same yield change",
      },
      {
        label: "Momentum (RSI on return / duration)",
        weight: 0.25,
        meaning:
          "14-day RSI of daily percent change divided by duration — strength per unit of rate risk, not raw price RSI",
      },
      {
        label: "Traded volume",
        weight: 0.2,
        meaning: "raw shares traded that day vs peers — higher is better: you can enter and exit without moving the price",
      },
      {
        label: "Positioning (COT, inverted)",
        weight: 0.2,
        meaning:
          "the only counter-trend vote. Last weekly CFTC print is held until the next release (no interpolation). Crowded longs lower the contribution for the whole curve",
      },
    ],
    note:
      "COT is inverted (1 − crowding) and applied at class level — it does not rank one ETF against another. The Regime Score (flight-to-quality vs inflation shock) is a separate model and is not mixed into this rank.",
  },
  fi_ig: {
    headline:
      "In investment-grade credit the score ranks names on duration-adjusted momentum and liquidity, plus whether that name’s duration band fits today’s term premium. Credit spreads live in the class Regime Score — FRED OAS is an index, not a per-ETF reading.",
    ingredients: [
      {
        label: "Price trend / duration",
        weight: 0.3,
        meaning:
          "price vs the 50- and 200-day averages, each divided by modified duration so a long corporate fund is not ranked higher just because it moves more for the same yield change",
      },
      {
        label: "Momentum (RSI on return / duration)",
        weight: 0.2,
        meaning:
          "14-day RSI of daily percent change divided by duration — strength per unit of rate risk. Kept because IG has genuine rate-reversal, like Treasuries",
      },
      {
        label: "Traded volume",
        weight: 0.15,
        meaning: "raw shares traded that day vs peers — higher is better: you can enter and exit without moving the price",
      },
      {
        label: "Duration fit vs term premium",
        weight: 0.35,
        meaning:
          "by design a duration-band factor, not an issuer signal: names in the same maturity bucket get the same fit that day. High term premium favors longer duration; low term premium favors shorter",
      },
    ],
    note:
      "Duration fit is 1 − |duration percentile − term-premium percentile|. OAS (BAMLC0A0CM) is the same number for every name, so it cannot rank LQD vs VCIT — that layer stays in IGRegimeScore.",
  },
  fi_hy: {
    headline:
      "In high yield the score rewards genuine trend and discounts names that swing more than peers that day. Volatility is a symptom of credit stress, not the default itself — ICE BofA OAS (including BB/B/CCC) stays in the class Regime Score.",
    ingredients: [
      {
        label: "Price trend",
        weight: 0.35,
        meaning:
          "price vs the 50- and 200-day averages. Kept because HY behaves more like credit with an equity-like trend than like a pure rate instrument",
      },
      {
        label: "Momentum (RSI)",
        weight: 0.25,
        meaning:
          "recent strength of the move. Unlike Cash, RSI is not an artifact here — HY has real reversals",
      },
      {
        label: "Traded volume",
        weight: 0.15,
        meaning: "raw shares traded that day vs peers — higher is better: you can enter and exit without moving the price",
      },
      {
        label: "20-day volatility (inverted)",
        weight: 0.25,
        meaning:
          "how much the price swung in the last 20 sessions vs other HY names that day — lower is better. A market-wide risk-off that lifts everyone’s vol does not single out one ETF",
      },
    ],
    note:
      "The scored sleeve (HYG, JNK, USHY, SJNK) is all broad HY, so FRED rating-bucket OAS (BB/B/CCC) is the same backdrop for every name and cannot rank them. Credit spread, quality mix, and distress stay in HYRegimeScore. 0.5 is the median name — vol is inverted so the four grades still average to a 0–1 score.",
  },
  fi_tips: {
    headline: "In TIPS the score combines technicals with how duration fits real yields.",
    ingredients: [
      { label: "Price trend", weight: 0.3, meaning: "price above the averages" },
      { label: "Momentum (RSI)", weight: 0.2, meaning: "recent strength of the move" },
      { label: "Traded volume", weight: 0.15, meaning: "more liquid is better" },
      { label: "Real-yield fit", weight: 0.35, meaning: "duration suited to the current real yield" },
    ],
  },
  fi_preferred: {
    headline: "In preferreds the score weights income and trend, discounting swing.",
    ingredients: [
      { label: "Price trend", weight: 0.3, meaning: "price above the averages" },
      { label: "Momentum (RSI)", weight: 0.2, meaning: "recent strength of the move" },
      { label: "Dividend yield", weight: 0.25, meaning: "income distributed vs peers" },
      { label: "20-day volatility", weight: 0.25, meaning: "a discount for names that swing more" },
    ],
  },
  us_equity: {
    headline: "In US stocks the score rewards trend and momentum, discounting volatility.",
    ingredients: [
      { label: "Price trend", weight: 0.35, meaning: "price above the 50- and 200-day averages" },
      { label: "Momentum (RSI)", weight: 0.25, meaning: "recent strength of the move" },
      { label: "Traded volume", weight: 0.2, meaning: "more liquid is better" },
      { label: "20-day volatility", weight: 0.2, meaning: "a discount for names that swing more than peers" },
    ],
  },
  intl_equity: {
    headline: "In international stocks the score includes how much the name depends on the dollar.",
    ingredients: [
      { label: "Price trend", weight: 0.3, meaning: "price above the averages" },
      { label: "Momentum (RSI)", weight: 0.2, meaning: "recent strength of the move" },
      { label: "Stability", weight: 0.2, meaning: "less swing is better" },
      { label: "Currency exposure", weight: 0.3, meaning: "dollar sensitivity close to the class target" },
    ],
  },
  em_equity: {
    headline: "In emerging markets the score includes how much the name depends on China.",
    ingredients: [
      { label: "Price trend", weight: 0.3, meaning: "price above the averages" },
      { label: "Momentum (RSI)", weight: 0.2, meaning: "recent strength of the move" },
      { label: "Traded volume", weight: 0.2, meaning: "more liquid is better" },
      { label: "China exposure", weight: 0.3, meaning: "China sensitivity close to the class target" },
    ],
  },
  reits: {
    headline: "In REITs the score weights income and trend, discounting swing.",
    ingredients: [
      { label: "Price trend", weight: 0.3, meaning: "price above the averages" },
      { label: "Dividend yield", weight: 0.25, meaning: "income distributed vs peers" },
      { label: "Traded volume", weight: 0.25, meaning: "more liquid is better" },
      { label: "20-day volatility", weight: 0.2, meaning: "a discount for names that swing more" },
    ],
  },
  credito_alternativo: {
    headline: "In alternative credit the score looks at the discount to net asset value.",
    ingredients: [
      { label: "Price trend", weight: 0.25, meaning: "price above the averages" },
      { label: "Discount to NAV", weight: 0.3, meaning: "buying below net asset value is better" },
      { label: "Dividend yield", weight: 0.25, meaning: "income distributed vs peers" },
      { label: "20-day volatility", weight: 0.2, meaning: "a discount for names that swing more" },
    ],
  },
  commodities_precious: {
    headline: "In precious metals the score includes the fund's cost, which erodes return over time.",
    ingredients: [
      { label: "Price trend", weight: 0.35, meaning: "price above the averages" },
      { label: "Momentum (RSI)", weight: 0.25, meaning: "recent strength of the move" },
      { label: "Traded volume", weight: 0.25, meaning: "more liquid is better" },
      { label: "Expense ratio", weight: 0.15, meaning: "cheaper is better" },
    ],
  },
  commodities_energy: {
    headline: "In energy the score includes how closely the name tracks oil.",
    ingredients: [
      { label: "Price trend", weight: 0.35, meaning: "price above the averages" },
      { label: "Momentum (RSI)", weight: 0.2, meaning: "recent strength of the move" },
      { label: "Traded volume", weight: 0.2, meaning: "more liquid is better" },
      { label: "Oil adherence", weight: 0.25, meaning: "oil sensitivity close to the class target" },
    ],
  },
  energy_mlp: {
    headline: "In energy MLPs the score weights income and trend, discounting swing.",
    ingredients: [
      { label: "Price trend", weight: 0.3, meaning: "price above the averages" },
      { label: "Dividend yield", weight: 0.3, meaning: "income distributed vs peers" },
      { label: "Traded volume", weight: 0.2, meaning: "more liquid is better" },
      { label: "20-day volatility", weight: 0.2, meaning: "a discount for names that swing more" },
    ],
  },
  healthcare_biotech: {
    headline: "In healthcare and biotech the score includes the density of regulatory catalysts.",
    ingredients: [
      { label: "Price trend", weight: 0.25, meaning: "price above the averages" },
      { label: "Momentum (RSI)", weight: 0.2, meaning: "recent strength of the move" },
      { label: "Traded volume", weight: 0.2, meaning: "more liquid is better" },
      { label: "Catalysts (FDA)", weight: 0.35, meaning: "the class regulatory calendar" },
    ],
  },
  alt_infrastructure: {
    headline: "In infrastructure the score weights income, trend, and stability.",
    ingredients: [
      { label: "Price trend", weight: 0.35, meaning: "price above the averages" },
      { label: "Dividend yield", weight: 0.25, meaning: "income distributed vs peers" },
      { label: "Stability", weight: 0.2, meaning: "less swing is better" },
      { label: "Traded volume", weight: 0.2, meaning: "more liquid is better" },
    ],
  },
  currencies: {
    headline: "In FX the score rewards low cost, liquidity, and the right dollar exposure.",
    ingredients: [
      { label: "Expense ratio", weight: 0.5, meaning: "cheaper is better" },
      { label: "Liquidity", weight: 0.3, meaning: "more liquid is better" },
      { label: "Dollar exposure", weight: 0.2, meaning: "dollar sensitivity close to the class target" },
    ],
  },
};

export function scoreRecipeFor(classId: string): ScoreRecipe | null {
  return RECIPES[classId] ?? null;
}
