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
  Overweight: "Aumentar peso da classe",
  Hold: "Manter peso da classe",
  Reduce: "Reduzir peso da classe",
  "Strong Reduce": "Reduzir peso com convicção",
  Unknown: "Peso da classe indefinido",
};

const QUALITY_LABELS: Record<InstrumentQuality, string> = {
  Preferred: "Preferido entre os pares",
  Competitive: "Competitivo entre os pares",
  Weak: "Fraco vs pares da classe",
  Unknown: "Comparação com pares indisponível",
};

const ENTRY_LABELS: Record<EntryTiming, string> = {
  Buy: "Comprar agora",
  Wait: "Aguardar melhor entrada",
  Neutral: "Momento indiferente",
  Avoid: "Evitar entrada agora",
  Unknown: "Entrada indefinida",
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
        "Vem do modelo de regime da classe (macro, carry e curva). Responde quanto alocar no agregado, não se este papel específico é uma compra.",
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
        "Derivado do estágio da classe no motor. Responde quanto alocar no agregado, não se este papel específico é uma compra.",
    };
  }

  return {
    stance: "Unknown",
    label: ALLOCATION_LABELS.Unknown,
    score: null,
    source: "none",
    explanation: "Sem score de classe no snapshot do motor.",
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
        "Sem score de security layer para este ticker — usando apenas a leitura da classe.",
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
        ? `Ranking cross-sectional dentro da classe: ${(score * 100).toFixed(0)}º percentil entre os pares. É uma comparação relativa, não um sinal de compra.`
        : `Score relativo dentro da classe: ${score.toFixed(3)} (fora da faixa 0–1 por penalidades do modelo, como crowding). É uma comparação com os pares, não um sinal de compra.`
      : "Score composto direcional do papel no motor.";

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
      "Instrumento de caixa: o NAV é estável por construção, então não existe um ponto de entrada técnico relevante.",
    );
    if (allocationBlocks) {
      reasons.push("O modelo de regime pede reduzir caixa — o carry não compensa aumentar agora.");
      return {
        timing: "Avoid",
        label: ENTRY_LABELS.Avoid,
        reasons,
        explanation:
          "Para caixa, a decisão de entrada é a decisão de alocação. Com o sleeve em redução, não aumente a posição.",
      };
    }
    if (quality === "Weak") {
      reasons.push("Há instrumentos melhores dentro do próprio sleeve de caixa (liquidez e estabilidade).");
      return {
        timing: "Wait",
        label: ENTRY_LABELS.Wait,
        reasons,
        explanation:
          "Antes de aportar, troque pelo par mais líquido e menos volátil da mesma classe.",
      };
    }
    if (allocation === "Overweight") {
      reasons.push("O modelo de regime pede aumentar caixa e este papel está entre os melhores pares.");
      return {
        timing: "Buy",
        label: ENTRY_LABELS.Buy,
        reasons,
        explanation:
          "Aporte quando precisar de caixa: o custo de esperar é o carry perdido, não um risco de preço.",
      };
    }
    reasons.push("O sleeve está em manutenção — aportar ou não é uma decisão de necessidade de liquidez.");
    return {
      timing: "Neutral",
      label: ENTRY_LABELS.Neutral,
      reasons,
      explanation:
        "Não espere por um preço melhor: em caixa, esperar custa carry e não reduz risco de forma relevante.",
    };
  }

  let score = 0;

  if (trend.direction === "up") {
    score += 1;
    reasons.push("Médias de 20 e 50 dias em tendência de alta.");
  } else if (trend.direction === "down") {
    score -= 1;
    reasons.push("Médias de 20 e 50 dias em tendência de baixa.");
  } else if (trend.direction === "sideways") {
    reasons.push("Preço lateral: médias de 20 e 50 dias sem inclinação definida.");
  }

  if (bollinger.zone === "above_upper") {
    score -= 1;
    reasons.push("Preço acima da banda superior de Bollinger — esticado para cima, entrada cara.");
  } else if (bollinger.zone === "upper_half") {
    reasons.push("Preço na metade superior da banda de Bollinger.");
  } else if (bollinger.zone === "middle") {
    reasons.push("Preço na mediana da banda de Bollinger — sem desconto nem esticamento.");
  } else if (bollinger.zone === "lower_half") {
    score += trend.direction === "down" ? 0 : 1;
    reasons.push(
      trend.direction === "down"
        ? "Preço na metade inferior da banda, mas dentro de tendência de baixa — pode continuar caindo."
        : "Preço na metade inferior da banda de Bollinger — desconto dentro da faixa normal.",
    );
  } else if (bollinger.zone === "below_lower") {
    score += trend.direction === "down" ? -1 : 1;
    reasons.push(
      trend.direction === "down"
        ? "Preço rompeu a banda inferior em tendência de baixa — sinal de fraqueza, não de barganha."
        : "Preço abaixo da banda inferior sem tendência de baixa — esticado para baixo.",
    );
  }

  if (price != null && trend.sma50 != null) {
    if (price > trend.sma50) {
      score += 1;
      reasons.push("Preço acima da média de 50 dias.");
    } else {
      score -= 1;
      reasons.push("Preço abaixo da média de 50 dias.");
    }
  }

  if (allocationBlocks) {
    reasons.push("O modelo de regime da classe pede reduzir exposição.");
    return {
      timing: "Avoid",
      label: ENTRY_LABELS.Avoid,
      reasons,
      explanation:
        "Mesmo com sinais técnicos pontuais, a classe está em redução — novas entradas ficam contra o regime.",
    };
  }

  if (quality === "Weak") {
    reasons.push("O papel está no terço inferior do ranking da própria classe.");
    return {
      timing: "Wait",
      label: ENTRY_LABELS.Wait,
      reasons,
      explanation:
        "Prefira um par melhor classificado dentro da mesma classe antes de aportar neste papel.",
    };
  }

  if (score >= 2) {
    return {
      timing: "Buy",
      label: ENTRY_LABELS.Buy,
      reasons,
      explanation: "Tendência e posição na banda confirmam entrada neste momento.",
    };
  }
  if (score <= -2) {
    return {
      timing: "Avoid",
      label: ENTRY_LABELS.Avoid,
      reasons,
      explanation: "Preço e tendência apontam fraqueza — aguarde estabilização antes de entrar.",
    };
  }
  return {
    timing: "Wait",
    label: ENTRY_LABELS.Wait,
    reasons,
    explanation:
      "Os sinais de preço não confirmam nem negam entrada: sem gatilho, esperar custa pouco.",
  };
}

function resolvePosition(
  allocation: AllocationStance,
  quality: InstrumentQuality,
  entry: EntryTiming,
): DecisionSummary["position"] {
  let newMoney: string;
  if (entry === "Buy") {
    newMoney = "Pode aportar agora, respeitando o peso alvo da classe.";
  } else if (entry === "Avoid") {
    newMoney = "Não aporte agora.";
  } else if (entry === "Wait") {
    newMoney = "Aguarde confirmação antes de aportar dinheiro novo.";
  } else {
    newMoney = "Aporte conforme a necessidade de liquidez, não conforme o preço.";
  }

  let existing: string;
  if (allocation === "Strong Reduce") {
    existing = "Se já está posicionado, reduza a exposição da classe.";
  } else if (allocation === "Reduce") {
    existing = "Se já está posicionado, reduza gradualmente ou pare de reinvestir.";
  } else if (quality === "Weak") {
    existing = "Se já está posicionado, mantenha, mas avalie trocar por um par melhor classificado.";
  } else {
    existing = "Se já está posicionado, mantenha — nada aqui pede venda.";
  }

  return { newMoney, existing };
}

function buildHeadline(
  allocation: AllocationStance,
  entry: EntryTiming,
  stabilityFocused: boolean,
): string {
  if (allocation === "Strong Reduce" || allocation === "Reduce") {
    return "Reduza a exposição da classe; não aporte dinheiro novo agora.";
  }
  if (entry === "Buy") {
    return "Momento favorável para aportar; se já está posicionado, mantenha.";
  }
  if (entry === "Avoid") {
    return "Não aporte agora; se já está posicionado, mantenha e reavalie.";
  }
  if (entry === "Neutral" && stabilityFocused) {
    return "Aporte conforme a necessidade de caixa; esperar por preço melhor não faz sentido aqui.";
  }
  return "Aguarde uma entrada melhor; se já está posicionado, mantenha.";
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
    return "Entrada não validada: o motor não considera este papel elegível para aportes incrementais no momento.";
  }
  if (stabilityFocused) {
    return "Entrada validada significa apenas que o papel é elegível para aportes de caixa dentro do sleeve — não é um sinal de que o preço está barato.";
  }
  return "Entrada validada significa que o papel passou nos critérios de elegibilidade do motor (estágio e score vs classe). Não é confirmação técnica de que este é o melhor momento de compra.";
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
  priceParts.push(`Preço ${price.bollinger.label}.`);
  priceParts.push(`Leitura de tendência: ${price.trend.label}.`);
  if (decision.stabilityFocused) {
    priceParts.push(
      "Para instrumentos de caixa, osciladores de momentum não são informativos: o NAV sobe de forma quase monotônica e distribuições periódicas criam quedas artificiais.",
    );
  }

  const sections: NarrativeSection[] = [
    { title: "O que o motor está dizendo", body: motorBody },
    { title: "O que o preço está dizendo", body: priceParts.join(" ") },
    {
      title: "O que fazer",
      body: `${entry.label}. ${entry.explanation} ${position.newMoney} ${position.existing}`,
    },
    {
      title: "O que mudaria esta leitura",
      body: buildInvalidationText(decision),
    },
    {
      title: "Sobre a expressão “entrada validada”",
      body: entryValidatedExplanation(context.entryValidated, decision.stabilityFocused),
    },
  ];

  return sections;
}

function buildInvalidationText(decision: DecisionSummary): string {
  const parts: string[] = [];

  if (decision.stabilityFocused) {
    parts.push(
      "Mudança no regime de caixa (queda do carry real, curva desinvertendo ou alta probabilidade de corte de juros) muda a recomendação de alocação.",
    );
    parts.push(
      "No nível do papel, perda de liquidez relativa ou aumento da volatilidade do NAV rebaixaria o ranking vs pares.",
    );
    return parts.join(" ");
  }

  const { bollinger, trend } = decision.price;
  if (trend.sma50 != null) {
    parts.push(
      `Fechamento consistente ${trend.direction === "down" ? "acima" : "abaixo"} da média de 50 dias (${trend.sma50.toFixed(2)}) inverteria a leitura de tendência.`,
    );
  }
  if (bollinger.upper != null && bollinger.lower != null) {
    parts.push(
      `Rompimento das bandas de Bollinger (${bollinger.lower.toFixed(2)} / ${bollinger.upper.toFixed(2)}) com volume acima da média confirmaria uma nova direção.`,
    );
  }
  parts.push("No nível macro, mudança da ação de regime da classe altera a recomendação de peso.");
  return parts.join(" ");
}
