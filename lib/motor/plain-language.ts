/**
 * Plain-language labels for the market table.
 *
 * The motor speaks in modelling terms — "Maduro", "entryValidated", a 0–1
 * cross-sectional rank. Those are precise but unreadable for someone opening the
 * app to decide where to put money. This module is the single place that turns
 * each model concept into a phrase that answers the question the reader actually
 * has, and into the one-line explanation shown on hover.
 */

export type PlainLabel = {
  label: string;
  /** Full sentence shown on hover — must say what the reader should do, not how it was computed. */
  hint: string;
  tone: "positive" | "neutral" | "caution" | "negative" | "unknown";
};

const TONE_CLASS: Record<PlainLabel["tone"], string> = {
  positive: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  neutral: "bg-zinc-800 text-zinc-300 ring-zinc-700",
  caution: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  negative: "bg-red-500/10 text-red-300 ring-red-500/30",
  unknown: "bg-zinc-900 text-zinc-500 ring-zinc-800",
};

export function toneBadgeClass(tone: PlainLabel["tone"]): string {
  return TONE_CLASS[tone];
}

/**
 * Allocation direction for the sleeve — "where is this asset class heading".
 *
 * The model word is the *direction of travel*, not a verdict on past results:
 * Reduce means the trend turned against the class, not that it already lost money.
 */
export function plainTrend(stageLabel: string | null | undefined): PlainLabel {
  switch (stageLabel) {
    case "Accumulate":
    case "Ascendente":
      return {
        label: "Increase",
        hint: "The class trend is in your favor: the model supports putting more money here.",
        tone: "positive",
      };
    case "Hold":
    case "Maduro":
      return {
        label: "Hold",
        hint: "No clear trend: the model supports keeping what you already hold, without adding faster.",
        tone: "neutral",
      };
    case "Reduce":
    case "Descendente":
      return {
        label: "Reduce",
        hint: "The trend turned against the class. That is not a realized loss — it means the wind changed direction.",
        tone: "caution",
      };
    case "Strong Reduce":
    case "ForteDescendente":
      return {
        label: "Reduce hard",
        hint: "The trend is clearly negative: the model supports cutting exposure, not just pausing new money.",
        tone: "negative",
      };
    default:
      return {
        label: "No data",
        hint: "The motor has not scored this name yet. Wait for the next daily run.",
        tone: "unknown",
      };
  }
}

/**
 * Whether *new* money is eligible here.
 *
 * This replaces "Validated / Not validated", which read like a data-quality
 * check. The question being answered is "can I add money now?" — and the answer
 * is about eligibility, never a promise of return.
 */
export function plainNewMoney(input: {
  entryTiming?: string | null;
  entryValidated: boolean;
  hasMotorData: boolean;
  motorScope?: "ticker" | "class" | "none";
}): PlainLabel {
  if (!input.hasMotorData) {
    return {
      label: "No data",
      hint: "The motor has not scored this name yet. Wait for the next daily run.",
      tone: "unknown",
    };
  }

  switch (input.entryTiming) {
    case "Buy":
      return {
        label: "Can add",
        hint: "The class is favorable and this name ranks among the best in the group. Eligible for new money — not a return guarantee.",
        tone: "positive",
      };
    case "Wait":
      return {
        label: "Wait",
        hint: "Eligible, but no rush: the class still needs confirmation, or this name is not among the best in the group.",
        tone: "caution",
      };
    case "Avoid":
      return {
        label: "Do not add",
        hint: "The model advises against new money here now. Existing holders do not necessarily need to sell — see the name's page.",
        tone: "negative",
      };
    case "Neutral":
      return {
        label: "Indifferent",
        hint: "For a cash reserve there is no good or bad entry: the name is for holding cash, not for seeking appreciation.",
        tone: "neutral",
      };
    default:
      break;
  }

  // Older snapshots only carry the boolean; keep the same vocabulary.
  if (input.motorScope === "class") {
    return input.entryValidated
      ? {
          label: "Can add",
          hint: "Scored at the class level, not the name: the class accepts new money, but this specific name has not been scored yet.",
          tone: "neutral",
        }
      : {
          label: "Do not add",
          hint: "Scored at the class level, not the name: the class is unfavorable for new money.",
          tone: "caution",
        };
  }

  return input.entryValidated
    ? {
        label: "Can add",
        hint: "Eligible for new money: the class is not unfavorable and the name sits above the group median.",
        tone: "positive",
      }
    : {
        label: "Do not add",
        hint: "Not eligible for new money now: the class is unfavorable or the name sits below the group median.",
        tone: "negative",
      };
}

/** How the instrument ranks against the other names scored in its own class. */
export function plainQuality(input: {
  instrumentQuality?: string | null;
  score: number | null;
}): PlainLabel {
  const quality = input.instrumentQuality;
  if (quality === "Preferred") {
    return {
      label: "Among the best",
      hint: "It sits at the top of its own class ranking.",
      tone: "positive",
    };
  }
  if (quality === "Competitive") {
    return {
      label: "In the middle",
      hint: "It sits in the middle of its own class ranking.",
      tone: "neutral",
    };
  }
  if (quality === "Weak") {
    return {
      label: "Among the weakest",
      hint: "It sits in the bottom of its own class ranking.",
      tone: "caution",
    };
  }
  if (input.score == null) {
    return { label: "—", hint: "No score available.", tone: "unknown" };
  }
  return {
    label: input.score >= 0.5 ? "Above median" : "Below median",
    hint: "Where this name sits in its own class ranking.",
    tone: input.score >= 0.5 ? "neutral" : "caution",
  };
}
