/**
 * Separates the four questions the UI used to collapse into one verdict:
 *
 * 1. Allocation  — how much of this asset class to hold (regime layer).
 * 2. Instrument  — how good this ticker is versus its peers (security layer).
 * 3. Entry       — whether now is a good moment to buy (price confirmation).
 * 4. Reliability — how trustworthy the underlying data is (audit, elsewhere).
 *
 * Conflating 1 and 2 is what produced "Buy" gauges on instruments the motor
 * actually rates as merely median, and "Validated + Hold" readings that carry no
 * timing information.
 */

import type { SymbolMotorContext } from "./snapshot-types";
import type { TechnicalIndicatorRow } from "@/lib/market/technical-summary";
import { buyProximity, type BuyProximity } from "./buy-proximity";
import {
  classScoreProfile,
  type ScoreDomain,
} from "./score-domain";
import {
  bollingerPosition,
  trendState,
  type BollingerPosition,
  type StructureBar,
  type TrendState,
} from "@/lib/market/price-structure";
import { applicableTechnicalRows } from "@/lib/market/indicator-applicability";

export type AllocationStance =
  | "Overweight"
  | "Hold"
  | "Reduce"
  | "Strong Reduce"
  | "Unknown";

export type InstrumentQuality = "Preferred" | "Competitive" | "Weak" | "Unknown";

export type EntryTiming = "Buy" | "Wait" | "Neutral" | "Avoid" | "Unknown";

export type DecisionSummary = {
  classId: string;
  scoreDomain: ScoreDomain;
  stabilityFocused: boolean;
  allocation: {
    stance: AllocationStance;
    label: string;
    score: number | null;
    source: "regime_model" | "class_stage" | "none";
    explanation: string;
  };
  instrument: {
    quality: InstrumentQuality;
    label: string;
    score: number | null;
    /** Percentile in the peer universe when the score domain is `unit`. */
    percentile: number | null;
    explanation: string;
  };
  entry: {
    timing: EntryTiming;
    label: string;
    reasons: string[];
    explanation: string;
  };
  proximity: BuyProximity;
  position: {
    newMoney: string;
    existing: string;
  };
  headline: string;
  gauge: {
    value: number | null;
    /** What the needle measures, so the axis is never mistaken for Buy/Sell. */
    subject: "instrument_quality" | "directional_signal";
  };
  price: {
    bollinger: BollingerPosition;
    trend: TrendState;
  };
};

const ALLOCATION_LABELS: Record<AllocationStance, string> = {
  Overweight: "Increase class weight",
  Hold: "Hold class weight",
  Reduce: "Reduce class weight",
  "Strong Reduce": "Reduce class weight with conviction",
  Unknown: "Class weight undefined",
};

const QUALITY_LABELS: Record<InstrumentQuality, string> = {
  Preferred: "Preferred among peers",
  Competitive: "Competitive among peers",
  Weak: "Weak vs class peers",
  Unknown: "Peer comparison unavailable",
};

const ENTRY_LABELS: Record<EntryTiming, string> = {
  Buy: "Buy now",
  Wait: "Wait for a better entry",
  Neutral: "Timing indifferent",
  Avoid: "Avoid entry now",
  Unknown: "Entry undefined",
};

function stanceFromLabel(label: string | null | undefined): AllocationStance {
  const value = (label ?? "").trim().toLowerCase();
  if (!value) return "Unknown";
  if (value.includes("strong reduce") || value.includes("fortedescendente")) {
    return "Strong Reduce";
  }
  if (value.includes("overweight") || value.includes("accumulate") || value.includes("ascendente")) {
    return "Overweight";
  }
  if (value.includes("reduce") || value.includes("descendente")) return "Reduce";
  if (value.includes("hold") || value.includes("maduro")) return "Hold";
  return "Unknown";
}

function resolveAllocation(motor: SymbolMotorContext): DecisionSummary["allocation"] {
  const regimeAction =
    motor.classSnap?.regimeModel?.action ?? motor.decision?.allocationAction;
  const regimeScore = motor.classSnap?.regimeModel?.score ?? motor.classScore;

  if (regimeAction) {
    const stance = stanceFromLabel(regimeAction);
    return {
      stance,
      label: ALLOCATION_LABELS[stance],
      score: regimeScore ?? null,
      source: "regime_model",
      explanation:
        "Comes from the class regime model (macro, carry, and the curve). It answers how much to allocate in aggregate, not whether this specific name is a buy.",
    };
  }

  if (motor.hasClassMotor) {
    const stance = stanceFromLabel(motor.classStageLabel);
    return {
      stance,
      label: ALLOCATION_LABELS[stance],
      score: motor.classScore,
      source: "class_stage",
      explanation:
        "Derived from the class stage in the motor. It answers how much to allocate in aggregate, not whether this specific name is a buy.",
    };
  }

  return {
    stance: "Unknown",
    label: ALLOCATION_LABELS.Unknown,
    score: null,
    source: "none",
    explanation: "No class score in the motor snapshot.",
  };
}

function resolveInstrument(
  motor: SymbolMotorContext,
  domain: ScoreDomain,
  thresholds: { strong: number; weak: number },
): DecisionSummary["instrument"] {
  const score = motor.hasTickerMotor ? motor.score : null;

  if (score == null || !Number.isFinite(score)) {
    return {
      quality: "Unknown",
      label: QUALITY_LABELS.Unknown,
      score: null,
      percentile: null,
      explanation:
        "No security-layer score for this ticker — using the class reading only.",
    };
  }

  const quality: InstrumentQuality =
    score >= thresholds.strong ? "Preferred" : score >= thresholds.weak ? "Competitive" : "Weak";

  // Some security models subtract a crowding penalty, so the composite can fall
  // outside [0, 1]; only call it a percentile when it actually is one.
  const isPercentile = domain === "unit" && score >= 0 && score <= 1;
  const percentile = isPercentile ? score : null;
  const explanation =
    domain === "unit"
      ? isPercentile
        ? `Cross-sectional ranking inside the class: ${(score * 100).toFixed(0)}th percentile among peers. This is a relative comparison, not a buy signal.`
        : `Relative score inside the class: ${score.toFixed(3)} (outside the 0–1 range because of model penalties such as crowding). This is a peer comparison, not a buy signal.`
      : "Directional composite score for this name in the motor.";

  return {
    quality,
    label: QUALITY_LABELS[quality],
    score,
    percentile,
    explanation,
  };
}

type EntryInput = {
  stabilityFocused: boolean;
  allocation: AllocationStance;
  quality: InstrumentQuality;
  bollinger: BollingerPosition;
  trend: TrendState;
  price: number | null;
  technicalRows: TechnicalIndicatorRow[];
};

function resolveEntry(input: EntryInput): DecisionSummary["entry"] {
  const { stabilityFocused, allocation, quality, bollinger, trend, price } = input;
  const reasons: string[] = [];

  const allocationBlocks = allocation === "Reduce" || allocation === "Strong Reduce";

  if (stabilityFocused) {
    reasons.push(
      "Cash instrument: NAV is stable by construction, so there is no meaningful technical entry point.",
    );
    if (allocationBlocks) {
      reasons.push("The regime model calls for reducing cash — carry does not justify adding now.");
      return {
        timing: "Avoid",
        label: ENTRY_LABELS.Avoid,
        reasons,
        explanation:
          "For cash, the entry decision is the allocation decision. With the sleeve in reduction, do not add to the position.",
      };
    }
    if (quality === "Weak") {
      reasons.push("There are better instruments inside the cash sleeve itself (liquidity and stability).");
      return {
        timing: "Wait",
        label: ENTRY_LABELS.Wait,
        reasons,
        explanation:
          "Before adding, switch to the more liquid and less volatile peer in the same class.",
      };
    }
    if (allocation === "Overweight") {
      reasons.push("The regime model calls for increasing cash and this name ranks among the best peers.");
      return {
        timing: "Buy",
        label: ENTRY_LABELS.Buy,
        reasons,
        explanation:
          "Add when you need cash: the cost of waiting is lost carry, not price risk.",
      };
    }
    reasons.push("The sleeve is on hold — adding or not is a liquidity-need decision.");
    return {
      timing: "Neutral",
      label: ENTRY_LABELS.Neutral,
      reasons,
      explanation:
        "Do not wait for a better price: in cash, waiting costs carry and does not meaningfully reduce risk.",
    };
  }

  let score = 0;

  if (trend.direction === "up") {
    score += 1;
    reasons.push("20- and 50-day averages in an uptrend.");
  } else if (trend.direction === "down") {
    score -= 1;
    reasons.push("20- and 50-day averages in a downtrend.");
  } else if (trend.direction === "sideways") {
    reasons.push("Sideways price: 20- and 50-day averages with no clear slope.");
  }

  if (bollinger.zone === "above_upper") {
    score -= 1;
    reasons.push("Price above the upper Bollinger band — stretched higher, expensive entry.");
  } else if (bollinger.zone === "upper_half") {
    reasons.push("Price in the upper half of the Bollinger band.");
  } else if (bollinger.zone === "middle") {
    reasons.push("Price at the middle of the Bollinger band — neither a discount nor stretched.");
  } else if (bollinger.zone === "lower_half") {
    score += trend.direction === "down" ? 0 : 1;
    reasons.push(
      trend.direction === "down"
        ? "Price in the lower half of the band, but inside a downtrend — it can keep falling."
        : "Price in the lower half of the Bollinger band — a discount inside the normal range.",
    );
  } else if (bollinger.zone === "below_lower") {
    score += trend.direction === "down" ? -1 : 1;
    reasons.push(
      trend.direction === "down"
        ? "Price broke the lower band in a downtrend — a weakness signal, not a bargain."
        : "Price below the lower band without a downtrend — stretched lower.",
    );
  }

  if (price != null && trend.sma50 != null) {
    if (price > trend.sma50) {
      score += 1;
      reasons.push("Price above the 50-day average.");
    } else {
      score -= 1;
      reasons.push("Price below the 50-day average.");
    }
  }

  if (allocationBlocks) {
    reasons.push("The class regime model calls for reducing exposure.");
    return {
      timing: "Avoid",
      label: ENTRY_LABELS.Avoid,
      reasons,
      explanation:
        "Even with isolated technical signals, the class is in reduction — new entries go against the regime.",
    };
  }

  if (quality === "Weak") {
    reasons.push("The name sits in the bottom third of its own class ranking.");
    return {
      timing: "Wait",
      label: ENTRY_LABELS.Wait,
      reasons,
      explanation:
        "Prefer a better-ranked peer in the same class before adding to this name.",
    };
  }

  if (score >= 2) {
    return {
      timing: "Buy",
      label: ENTRY_LABELS.Buy,
      reasons,
      explanation: "Trend and band position confirm an entry at this moment.",
    };
  }
  if (score <= -2) {
    return {
      timing: "Avoid",
      label: ENTRY_LABELS.Avoid,
      reasons,
      explanation: "Price and trend point to weakness — wait for stabilization before entering.",
    };
  }
  return {
    timing: "Wait",
    label: ENTRY_LABELS.Wait,
    reasons,
    explanation:
      "Price signals neither confirm nor deny an entry: with no trigger, waiting costs little.",
  };
}

function resolvePosition(
  allocation: AllocationStance,
  quality: InstrumentQuality,
  entry: EntryTiming,
): DecisionSummary["position"] {
  let newMoney: string;
  if (entry === "Buy") {
    newMoney = "You can add now, staying within the class target weight.";
  } else if (entry === "Avoid") {
    newMoney = "Do not add now.";
  } else if (entry === "Wait") {
    newMoney = "Wait for confirmation before adding new money.";
  } else {
    newMoney = "Add according to liquidity need, not according to price.";
  }

  let existing: string;
  if (allocation === "Strong Reduce") {
    existing = "If you already hold it, reduce the class exposure.";
  } else if (allocation === "Reduce") {
    existing = "If you already hold it, reduce gradually or stop reinvesting.";
  } else if (quality === "Weak") {
    existing = "If you already hold it, keep it, but consider switching to a better-ranked peer.";
  } else {
    existing = "If you already hold it, keep it — nothing here calls for a sale.";
  };

  return { newMoney, existing };
}

function buildHeadline(
  allocation: AllocationStance,
  entry: EntryTiming,
  stabilityFocused: boolean,
): string {
  if (allocation === "Strong Reduce" || allocation === "Reduce") {
    return "Reduce the class exposure; do not add new money now.";
  }
  if (entry === "Buy") {
    return "A favorable moment to add; if you already hold it, keep it.";
  }
  if (entry === "Avoid") {
    return "Do not add now; if you already hold it, keep it and reassess.";
  }
  if (entry === "Neutral" && stabilityFocused) {
    return "Add according to cash need; waiting for a better price does not make sense here.";
  }
  return "Wait for a better entry; if you already hold it, keep it.";
}

export function buildDecisionSummary(input: {
  motor: SymbolMotorContext;
  classId: string;
  bars: StructureBar[];
  price: number | null;
  technicalRows: TechnicalIndicatorRow[];
}): DecisionSummary {
  const { motor, classId, bars, price, technicalRows } = input;
  const profile = classScoreProfile(classId);

  const closes = bars.map((b) => b.value);
  const bollinger = bollingerPosition(closes);
  const trend = trendState(closes);

  const allocation = resolveAllocation(motor);
  const instrument = resolveInstrument(motor, profile.domain, profile.security);
  const motorEntryReasons = motor.decision?.entryReasons ?? [];
  const entry = resolveEntry({
    stabilityFocused: profile.stabilityFocused,
    allocation: allocation.stance,
    quality: instrument.quality,
    bollinger,
    trend,
    price: price ?? closes[closes.length - 1] ?? null,
    technicalRows: applicableTechnicalRows(technicalRows, classId).rows,
  });
  if (motorEntryReasons.length > 0) {
    entry.reasons = [...entry.reasons, ...motorEntryReasons];
  }
  const position = resolvePosition(allocation.stance, instrument.quality, entry.timing);

  return {
    classId,
    scoreDomain: profile.domain,
    stabilityFocused: profile.stabilityFocused,
    allocation,
    instrument,
    entry,
    proximity: buyProximity({
      classId,
      regimeScore: allocation.score,
      securityScore: instrument.score,
      allocationAction: allocation.stance,
      instrumentQuality: instrument.quality,
      divergesFromClass: motor.divergesFromClass,
    }),
    position,
    headline: buildHeadline(allocation.stance, entry.timing, profile.stabilityFocused),
    gauge: {
      value: instrument.score,
      subject: profile.domain === "unit" ? "instrument_quality" : "directional_signal",
    },
    price: { bollinger, trend },
  };
}

/**
 * Explains what the motor's `entryValidated` flag does and does not mean. The
 * flag is a motor-level eligibility check, never a purchase instruction.
 */
export function entryValidatedExplanation(
  validated: boolean,
  stabilityFocused: boolean,
): string {
  if (!validated) {
    return "Entry not validated: the motor does not consider this name eligible for incremental adds right now.";
  }
  if (stabilityFocused) {
    return "Validated entry only means the name is eligible for cash adds inside the sleeve — it is not a signal that the price is cheap.";
  }
  return "Validated entry means the name passed the motor's eligibility criteria (stage and score vs the class). It is not technical confirmation that this is the best moment to buy.";
}

export type NarrativeSection = { title: string; body: string };

export function buildDecisionNarrative(
  decision: DecisionSummary,
  context: { classLabel: string; symbol: string; entryValidated: boolean },
): NarrativeSection[] {
  const { allocation, instrument, entry, position, price } = decision;

  const motorBody = [
    `${allocation.label} para ${context.classLabel}. ${allocation.explanation}`,
    instrument.explanation,
  ].join(" ");

  const priceParts: string[] = [];
  priceParts.push(`Price ${price.bollinger.label}.`);
  priceParts.push(`Trend reading: ${price.trend.label}.`);
  if (decision.stabilityFocused) {
    priceParts.push(
      "For cash instruments, momentum oscillators are not informative: NAV rises almost monotonically and periodic distributions create artificial drops.",
    );
  }

  const sections: NarrativeSection[] = [
    { title: "What the motor is saying", body: motorBody },
    { title: "What the price is saying", body: priceParts.join(" ") },
    {
      title: "What to do",
      body: `${entry.label}. ${entry.explanation} ${position.newMoney} ${position.existing}`,
    },
    {
      title: "What would change this reading",
      body: buildInvalidationText(decision),
    },
    {
      title: "About the phrase “validated entry”",
      body: entryValidatedExplanation(context.entryValidated, decision.stabilityFocused),
    },
  ];

  return sections;
}

function buildInvalidationText(decision: DecisionSummary): string {
  const parts: string[] = [];

  if (decision.stabilityFocused) {
    parts.push(
      "A change in the cash regime (falling real carry, the curve un-inverting, or a high probability of rate cuts) changes the allocation recommendation.",
    );
    parts.push(
      "At the name level, a loss of relative liquidity or a rise in NAV volatility would lower the ranking vs peers.",
    );
    return parts.join(" ");
  }

  const { bollinger, trend } = decision.price;
  if (trend.sma50 != null) {
    parts.push(
      `A consistent close ${trend.direction === "down" ? "above" : "below"} the 50-day average (${trend.sma50.toFixed(2)}) would reverse the trend reading.`,
    );
  }
  if (bollinger.upper != null && bollinger.lower != null) {
    parts.push(
      `A break of the Bollinger bands (${bollinger.lower.toFixed(2)} / ${bollinger.upper.toFixed(2)}) with above-average volume would confirm a new direction.`,
    );
  }
  parts.push("At the macro level, a change in the class regime action alters the weight recommendation.");
  return parts.join(" ");
}
