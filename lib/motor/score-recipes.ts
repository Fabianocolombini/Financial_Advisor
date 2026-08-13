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
};

const RECIPES: Record<string, ScoreRecipe> = {
  cash_equivalents: {
    headline:
      "In cash the score measures which name holds money better — not which will yield more.",
    ingredients: [
      { label: "Traded volume", weight: 0.4, meaning: "more liquid is better: you can enter and exit without cost" },
      { label: "20-day volatility", weight: 0.35, meaning: "less swing is better: cash should not bounce around" },
      { label: "Distance from the 50-day average", weight: 0.25, meaning: "the closer to the average, the better: a stretched price is an anomaly" },
    ],
  },
  fi_treasury: {
    headline: "In treasuries the score rewards the point on the curve with the best momentum and liquidity.",
    ingredients: [
      { label: "Price trend", weight: 0.35, meaning: "price above the 50- and 200-day averages" },
      { label: "Momentum (RSI)", weight: 0.25, meaning: "recent strength of the move" },
      { label: "Traded volume", weight: 0.2, meaning: "more liquid is better" },
      { label: "Positioning (COT)", weight: 0.2, meaning: "a discount when the market is crowded in the same trade" },
    ],
  },
  fi_ig: {
    headline: "In investment-grade credit the score combines technicals with how duration fits the backdrop.",
    ingredients: [
      { label: "Price trend", weight: 0.3, meaning: "price above the averages" },
      { label: "Momentum (RSI)", weight: 0.2, meaning: "recent strength of the move" },
      { label: "Traded volume", weight: 0.15, meaning: "more liquid is better" },
      { label: "Duration fit", weight: 0.35, meaning: "duration suited to the current term premium" },
    ],
  },
  fi_hy: {
    headline: "In high yield the score rewards trend and penalizes volatility, which is the real risk of the class.",
    ingredients: [
      { label: "Price trend", weight: 0.35, meaning: "price above the averages" },
      { label: "Momentum (RSI)", weight: 0.25, meaning: "recent strength of the move" },
      { label: "Traded volume", weight: 0.15, meaning: "more liquid is better" },
      { label: "20-day volatility", weight: 0.25, meaning: "a discount for names that swing more than peers" },
    ],
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
