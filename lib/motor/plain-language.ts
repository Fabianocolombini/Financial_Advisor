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
        label: "Aumentar",
        hint: "A tendência da classe está a favor: o modelo apoia colocar mais dinheiro aqui.",
        tone: "positive",
      };
    case "Hold":
    case "Maduro":
      return {
        label: "Manter",
        hint: "Sem tendência definida: o modelo apoia manter o que já está investido, sem acelerar aportes.",
        tone: "neutral",
      };
    case "Reduce":
    case "Descendente":
      return {
        label: "Reduzir",
        hint: "A tendência virou contra a classe. Não significa que já deu prejuízo — significa que o vento mudou de direção.",
        tone: "caution",
      };
    case "Strong Reduce":
    case "ForteDescendente":
      return {
        label: "Reduzir forte",
        hint: "A tendência é claramente negativa: o modelo apoia cortar exposição, não apenas parar de aportar.",
        tone: "negative",
      };
    default:
      return {
        label: "Sem dados",
        hint: "O motor ainda não pontuou este ativo. Aguarde a próxima rodada diária.",
        tone: "unknown",
      };
  }
}

/**
 * Whether *new* money is eligible here.
 *
 * This replaces "Validated / Not validated", which read like a data-quality
 * check. The question being answered is "posso aportar agora?" — and the answer
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
      label: "Sem dados",
      hint: "O motor ainda não avaliou este papel. Aguarde a próxima rodada diária.",
      tone: "unknown",
    };
  }

  switch (input.entryTiming) {
    case "Buy":
      return {
        label: "Pode aportar",
        hint: "A classe está favorável e este papel está entre os melhores do grupo. É elegível para dinheiro novo — não é uma garantia de retorno.",
        tone: "positive",
      };
    case "Wait":
      return {
        label: "Esperar",
        hint: "Elegível, mas sem pressa: falta confirmação da classe ou o papel não está entre os melhores do grupo.",
        tone: "caution",
      };
    case "Avoid":
      return {
        label: "Não aportar",
        hint: "O modelo desaconselha dinheiro novo aqui agora. Quem já tem posição não precisa necessariamente vender — veja a página do ativo.",
        tone: "negative",
      };
    case "Neutral":
      return {
        label: "Indiferente",
        hint: "Para reserva de caixa não existe momento bom ou ruim de entrada: o papel serve para guardar dinheiro, não para buscar valorização.",
        tone: "neutral",
      };
    default:
      break;
  }

  // Older snapshots only carry the boolean; keep the same vocabulary.
  if (input.motorScope === "class") {
    return input.entryValidated
      ? {
          label: "Pode aportar",
          hint: "Avaliado pela classe, não pelo papel: a classe aceita dinheiro novo, mas este papel específico ainda não foi pontuado.",
          tone: "neutral",
        }
      : {
          label: "Não aportar",
          hint: "Avaliado pela classe, não pelo papel: a classe está desfavorável para dinheiro novo.",
          tone: "caution",
        };
  }

  return input.entryValidated
    ? {
        label: "Pode aportar",
        hint: "Elegível para dinheiro novo: a classe não está desfavorável e o papel está acima da mediana do grupo.",
        tone: "positive",
      }
    : {
        label: "Não aportar",
        hint: "Não elegível para dinheiro novo agora: a classe está desfavorável ou o papel está abaixo da mediana do grupo.",
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
      label: "Entre os melhores",
      hint: "Está no topo do ranking da própria classe.",
      tone: "positive",
    };
  }
  if (quality === "Competitive") {
    return {
      label: "Na média",
      hint: "Fica no meio do ranking da própria classe.",
      tone: "neutral",
    };
  }
  if (quality === "Weak") {
    return {
      label: "Entre os piores",
      hint: "Está na parte de baixo do ranking da própria classe.",
      tone: "caution",
    };
  }
  if (input.score == null) {
    return { label: "—", hint: "Sem score disponível.", tone: "unknown" };
  }
  return {
    label: input.score >= 0.5 ? "Acima da mediana" : "Abaixo da mediana",
    hint: "Posição do papel no ranking da própria classe.",
    tone: input.score >= 0.5 ? "neutral" : "caution",
  };
}
