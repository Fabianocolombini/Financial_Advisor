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
    headline:
      "In TIPS the score ranks names on duration-adjusted momentum and liquidity, plus whether that name’s duration band fits today’s real yield. There is no credit ingredient — TIPS are Treasury-issued.",
    ingredients: [
      {
        label: "Price trend / duration",
        weight: 0.3,
        meaning:
          "ETF market close vs the 50- and 200-day averages, each divided by modified duration so a 15-year TIPS fund is not ranked higher just because it moves more for the same real-yield change. This is the fund share price (yfinance), not a TIPS dirty bond price",
      },
      {
        label: "Momentum (RSI on return / duration)",
        weight: 0.2,
        meaning:
          "14-day RSI of daily percent change divided by duration — strength per unit of real-rate risk",
      },
      {
        label: "Traded volume",
        weight: 0.15,
        meaning: "raw shares traded that day vs peers — higher is better: you can enter and exit without moving the price",
      },
      {
        label: "Real-yield fit vs DFII10",
        weight: 0.35,
        meaning:
          "by design a duration-band factor, not a paper-specific signal: names in the same maturity bucket get the same fit that day. High real yield favors longer duration; low real yield favors shorter",
      },
    ],
    note:
      "Real-yield fit is 1 − |duration percentile − real-yield percentile|. Inflation accretion lives inside ETF NAV; a common CPI drift lifts the whole sleeve, so the rank still compares who moved more. We do not CPI-deflate the price series.",
  },
  fi_preferred: {
    headline:
      "In preferreds the score weights income and trend, and discounts names that swing more than peers. A yield that only jumped because price collapsed is haircut — that is the yield-trap, not extra carry.",
    ingredients: [
      {
        label: "Price trend",
        weight: 0.3,
        meaning:
          "price vs the 50- and 200-day averages. Kept because preferreds trade like hybrids with an equity-like trend",
      },
      {
        label: "Momentum (RSI)",
        weight: 0.2,
        meaning: "recent strength of the move. Unlike Cash, RSI is not an artifact here",
      },
      {
        label: "Dividend yield (anti yield-trap)",
        weight: 0.25,
        meaning:
          "income vs peers after shrinking a yield that spiked versus its own 1-year history. A structurally high coupon still ranks high; a crash-inflated yield does not",
      },
      {
        label: "20-day volatility (inverted)",
        weight: 0.25,
        meaning:
          "how much the price swung in the last 20 sessions vs other preferreds that day — lower is better. Swing is a credit-stress symptom on subordinated paper",
      },
    ],
    note:
      "Yield used in the rank is y / (1 + max(z, 0)), where z is the yield’s own 252-day z-score. There is no issuer-rating ingredient: the scored sleeve is preferred ETFs, and EDGAR/FRED do not publish per-name preferred ratings. Bank stress and preferred spread stay in PreferredRegimeScore. Call-price ceiling is not in this score.",
  },
  us_equity: {
    headline:
      "In US stocks the score rewards trend and momentum, then liquidity in dollars, and discounts names that swing more than peers that day.",
    ingredients: [
      {
        label: "Price trend",
        weight: 0.35,
        meaning: "price vs the 50- and 200-day averages — higher is better: the move is established",
      },
      {
        label: "Momentum (RSI)",
        weight: 0.25,
        meaning: "14-day RSI — higher is better: recent strength of the move",
      },
      {
        label: "Dollar volume",
        weight: 0.2,
        meaning:
          "price × shares traded that day vs peers — higher is better. Share count would favor cheap names that are not more liquid in dollars",
      },
      {
        label: "20-day volatility (inverted)",
        weight: 0.2,
        meaning:
          "how much the price swung in the last 20 sessions vs other US names that day — lower is better",
      },
    ],
    note:
      "There is no valuation or quality ingredient (P/E, ROE) in this score: it is the technical selection layer inside the class. Fundamentals stay in USEquityRegimeScore (CAPE, earnings revision) or in a later pass. Percentiles are whole-universe, not sector- or size-neutral — the scored sleeve today is broad ETFs (SPY, QQQ, IWM, VOO).",
  },
  intl_equity: {
    headline:
      "In international stocks the score ranks names on USD-listed ETF prices, then asks how close their dollar sensitivity is to the class target.",
    ingredients: [
      {
        label: "Price trend",
        weight: 0.3,
        meaning:
          "price vs the 50- and 200-day averages of the USD ETF close — higher is better. There is no local-currency series for this sleeve (EFA, VEA, …)",
      },
      {
        label: "Momentum (RSI)",
        weight: 0.2,
        meaning: "14-day RSI of the same USD close — higher is better: recent strength of the move",
      },
      {
        label: "Stability (inverted 20-day vol)",
        weight: 0.2,
        meaning:
          "how much the price swung in the last 20 sessions vs other international names that day — lower is better",
      },
      {
        label: "Currency exposure (distance to target)",
        weight: 0.3,
        meaning:
          "how close |beta vs UUP| sits to the class target (35th percentile of the sleeve that day). Closer is better in both directions — not “more dollar beta is better”",
      },
    ],
    note:
      "Currency exposure is a regional/FX bucket, like duration fit in IG: two ETFs with the same dollar beta get the same fit. It does not pick issuers. USD prices do embed FX; converting a multi-country ETF by one FX rate would not isolate local performance, so that conversion is not used. No P/E or ROE in this layer.",
  },
  em_equity: {
    headline:
      "In emerging markets the score ranks names on USD ETF prices and liquidity in dollars, then asks how close their China sensitivity is to the class target.",
    ingredients: [
      {
        label: "Price trend",
        weight: 0.3,
        meaning: "price vs the 50- and 200-day averages of the USD ETF close — higher is better",
      },
      {
        label: "Momentum (RSI)",
        weight: 0.2,
        meaning: "14-day RSI — higher is better: recent strength of the move",
      },
      {
        label: "Dollar volume",
        weight: 0.2,
        meaning:
          "price × shares traded that day vs peers — higher is better. Share count would favor cheap names; EM liquidity gaps make that bias worse than in US stocks",
      },
      {
        label: "China exposure (distance to target)",
        weight: 0.3,
        meaning:
          "how close beta vs FXI sits to the class target (60th percentile of the sleeve that day). Closer is better in both directions — not “more China beta is better”. Ex-China names (EMXC) sit at the low end on purpose",
      },
    ],
    note:
      "There is no 20-day vol pillar: this sleeve is broad EM ETFs, so swing is a class property already in EMEquityRegimeScore (VIX + DXY stress). There is no FX pillar in this layer either: the names are USD vehicles, and dollar strength already sits in the regime score. China exposure is a structural bucket — two ETFs with the same FXI beta get the same fit.",
  },
  reits: {
    headline:
      "In REITs the score is bond-plus-equity: price trend on the share price, income after a crash haircut, dollar liquidity, and a small penalty for names that swing more than peers. RSI is left out on purpose.",
    ingredients: [
      {
        label: "Price trend",
        weight: 0.3,
        meaning:
          "price vs the 50- and 200-day averages of the ETF close (price return, not total return) — higher is better. Dividends are not mixed into this pillar",
      },
      {
        label: "Dividend yield (anti-trap)",
        weight: 0.35,
        meaning:
          "income vs other REITs that day, after y / (1 + max(z, 0)) where z is the yield’s own 252-day z-score. A crash that inflates yield is not extra carry",
      },
      {
        label: "Dollar volume",
        weight: 0.2,
        meaning:
          "price × shares traded that day vs peers — higher is better. The sleeve mixes large and small REIT ETFs",
      },
      {
        label: "20-day volatility (inverted)",
        weight: 0.15,
        meaning:
          "how much the price swung in the last 20 sessions vs other REITs that day — lower is better",
      },
    ],
    note:
      "Subtracting the 10-year Treasury yield (DGS10) does not change the rank inside the class: it is the same number for every name that day. REIT vs Treasury 10y lives in REITsRegimeScore (Nareit spread). There is no RSI: trend alone is the equity-like vote, so the formula does not double-count momentum.",
  },
  credito_alternativo: {
    headline:
      "In BDCs the score is credit first: discount to NAV, non-accrual in the loan book, whether net investment income covers the dividend, and only a small price-trend vote. RSI and raw yield stay out on purpose.",
    ingredients: [
      {
        label: "NAV premium/discount (inverted)",
        weight: 0.3,
        meaning:
          "market price vs last reported NAV per share — a wider discount ranks higher. NAV is quarterly (hold-last); the ratio updates with the as-of close",
      },
      {
        label: "Non-accrual rate (inverted)",
        weight: 0.3,
        meaning:
          "share of the loan book that has stopped accruing interest vs other listed BDCs that day — lower is better. Hold-last from the 10-Q",
      },
      {
        label: "Distribution coverage (NII / dividends)",
        weight: 0.25,
        meaning:
          "whether reported net investment income covers the dividend vs peers. This is the anti yield-trap pillar — high yield alone does not rank higher. Hold-last from the 10-Q",
      },
      {
        label: "Price trend",
        weight: 0.15,
        meaning:
          "price vs the 50- and 200-day averages of the close (price return, not total return) — higher is better. Residual technical vote",
      },
    ],
    note:
      "There is no RSI and no raw dividend yield. Non-accrual checks a cheap NAV: a wide discount with rising non-accrual is a likely value trap. NII is the reported figure (incentive fees are not stripped). HYG in the sleeve has no EDGAR prints and sits at the median on the credit pillars. SOFR and HY OAS stay in BDCRegimeScore.",
  },
  commodities_precious: {
    headline:
      "In precious metals the funds compete for the same ounce, so the score ranks trend and momentum, liquidity in dollars, and a cheaper vehicle. Gold COT and ETF holdings stay in the class layer — they do not pick GLD over IAU.",
    ingredients: [
      {
        label: "Price trend",
        weight: 0.35,
        meaning: "price vs the 50- and 200-day averages — higher is better",
      },
      {
        label: "Momentum (RSI)",
        weight: 0.25,
        meaning: "recent strength of the move vs other metal funds that day",
      },
      {
        label: "Dollar volume",
        weight: 0.25,
        meaning:
          "price × shares traded that day vs peers — higher is better. Share count would favor cheap tickers like SGOL",
      },
      {
        label: "Expense ratio (inverted)",
        weight: 0.15,
        meaning:
          "annual fund fee vs other metal ETFs that day — lower is better. This is the quality gap between GLD and IAU",
      },
    ],
    note:
      "CFTC gold COT and GLD holdings already sit in PreciousRegimeScore. On a given day they are the same number for every name, so putting them in this score would not change the rank. Trend and RSI stay at 35/25: metals do trend, and the overlap is accepted rather than reweighted.",
  },
  commodities_energy: {
    headline:
      "In energy the score ranks names after stripping oil-beta from the technicals, then asks whether that oil sensitivity sits near the class target. USO is the WTI proxy — not Brent.",
    ingredients: [
      {
        label: "Price trend / oil beta",
        weight: 0.35,
        meaning:
          "price vs the 50- and 200-day averages, divided by max(|beta vs USO|, 0.25) — higher is better per unit of oil sensitivity. Stops E&P from winning just because oil moved",
      },
      {
        label: "Momentum (RSI) / oil beta",
        weight: 0.2,
        meaning:
          "RSI on daily return divided by the same oil-beta scale — higher is better per unit of sensitivity",
      },
      {
        label: "Dollar volume",
        weight: 0.2,
        meaning:
          "price × shares traded that day vs peers — higher is better. Share count would favor cheap tickers like UNG",
      },
      {
        label: "Oil adherence",
        weight: 0.25,
        meaning:
          "distance of beta vs USO to the class target (70th percentile that day). Closer is better in both directions — a subsector bucket, not an issuer signal",
      },
    ],
    note:
      "Inventories, rigs, and WTI COT already sit in EnergyRegimeScore and are the same for every name that day. Trend and RSI stay at 35/20. Two names with the same USO beta get the same oil-adherence grade.",
  },
  energy_mlp: {
    headline:
      "In energy MLPs the score is income plus trend: the ETF close (not total return), distribution yield after a crash haircut, dollar liquidity, and a penalty for names that swing more than peers. There is no RSI on purpose.",
    ingredients: [
      {
        label: "Price trend",
        weight: 0.3,
        meaning:
          "price vs the 50- and 200-day averages of the ETF close (price return, not total return) — higher is better. Distributions are not mixed into this pillar",
      },
      {
        label: "Distribution yield (anti-trap)",
        weight: 0.3,
        meaning:
          "income vs other MLP funds that day, after y / (1 + max(z, 0)) where z is the yield’s own 252-day z-score. A crash that inflates yield is not extra carry",
      },
      {
        label: "Dollar volume",
        weight: 0.2,
        meaning:
          "price × shares traded that day vs peers — higher is better. The sleeve mixes AMLP-size funds with smaller midstream ETFs",
      },
      {
        label: "20-day volatility (inverted)",
        weight: 0.2,
        meaning:
          "how much the price swung in the last 20 sessions vs other MLP funds that day — lower is better",
      },
    ],
    note:
      "There is no RSI: trend alone is the directional vote. No oil-beta pillar: the scored sleeve is midstream/fee-based (AMLP, MLPX, ENFR…), not upstream E&P — that question lives in Energy. AMLP yield vs the 10-year Treasury sits in MLPRegimeScore. Coverage ratio (DCF / distributions) is a later layer.",
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
    headline:
      "In infrastructure the score is income plus the books: trend on the close, yield versus the name’s own history, whether free cash flow covers the dividend, cheapness versus the name’s own EV/EBITDA, leverage, and a small stability vote. RSI and volume stay out.",
    ingredients: [
      {
        label: "Price trend",
        weight: 0.2,
        meaning:
          "price vs the 50- and 200-day averages of the close (price return, not total return) — higher is better",
      },
      {
        label: "Dividend yield (own-history z)",
        weight: 0.15,
        meaning:
          "how far the yield sits above the name’s own 3-year history, then ranked vs peers. Towers are not punished for paying less than utilities. Coverage is the trap check",
      },
      {
        label: "Distribution coverage (FCF / dividends)",
        weight: 0.2,
        meaning:
          "free cash flow covering the dividend vs other issuers that day — higher is better. Hold-last from SEC companyfacts. ETFs sit at the median",
      },
      {
        label: "EV/EBITDA vs own history (inverted)",
        weight: 0.2,
        meaning:
          "z-score of EV/EBITDA vs the last 12 quarters — a discount to the name’s own multiple ranks higher. Neutralizes subsector (utilities vs towers)",
      },
      {
        label: "Debt/EBITDA (inverted)",
        weight: 0.15,
        meaning:
          "leverage vs other names that day — lower is better. Hold-last from companyfacts",
      },
      {
        label: "20-day volatility (inverted)",
        weight: 0.1,
        meaning:
          "how much the price swung in the last 20 sessions vs peers — lower is better",
      },
    ],
    note:
      "There is no RSI and no volume pillar. Yield is not a raw cross-section (that would mix utilities with towers). Real yield and utilities momentum stay in InfraRegimeScore. Issuers without a 10-Q in EDGAR (some LPs, Canadian names, all ETFs) sit at 0.5 on the three fundamental pillars.",
  },
  currencies: {
    headline:
      "In FX the score picks the vehicle, not the direction: cheaper access, liquidity in dollars, dollar-beta close to the class target, carry of the currency the fund actually holds, and how tightly it tracks the spot. There is no trend or RSI on purpose.",
    ingredients: [
      {
        label: "Expense ratio (inverted)",
        weight: 0.2,
        meaning:
          "annual fund fee vs other FX vehicles that day — lower is better. The fee rarely changes; that stability is accepted",
      },
      {
        label: "Dollar volume",
        weight: 0.2,
        meaning:
          "price × shares traded that day vs peers — higher is better. Share count would favor cheap tickers",
      },
      {
        label: "Dollar exposure (fit)",
        weight: 0.15,
        meaning:
          "distance of |beta vs UUP| to the class target (25th percentile of the sleeve that day). Closer is better in both directions — a vehicle bucket, not a call on the dollar",
      },
      {
        label: "Carry (rate differential)",
        weight: 0.3,
        meaning:
          "policy rate of the currency the ETF holds minus Fed funds (long-dollar funds: Fed minus the basket). Higher is better. Monotonic — not a distance-to-target. Hold-last from FRED/ECB",
      },
      {
        label: "Tracking error vs spot (inverted)",
        weight: 0.15,
        meaning:
          "annualized 63-day standard deviation of ETF return minus the FRED spot pair — lower is better. Realized cost, not the prospectus fee. CEW has no single spot and sits at the median",
      },
    ],
    note:
      "There is no price trend and no RSI: ConversionPaceScore already decides how fast to convert. Class-level Fed−ECB carry stays in the regime layer — it is the same number for every name that day and would not change the rank. Carry crash-risk has no vol offset in this version.",
  },
};

export function scoreRecipeFor(classId: string): ScoreRecipe | null {
  const aliases: Record<string, string> = {
    real_estate: "reits",
    alt_bdc: "credito_alternativo",
  };
  const key = aliases[classId] ?? classId;
  return RECIPES[key] ?? null;
}
