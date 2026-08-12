/**
 * What to do with a paper you already own.
 *
 * The motor's entry timing answers "should I buy this?". Once the lot is in the
 * wallet the question changes: stay, add, leave because the target was hit, or
 * leave because the trend turned. The user's own min/max bands outrank the motor
 * — they are the plan they wrote when they bought.
 */

export type WalletAction = "stay" | "add" | "leave" | "falling";

export type WalletActionLabel = {
  action: WalletAction;
  label: string;
  hint: string;
  tone: "positive" | "neutral" | "caution" | "negative";
};

export type WalletPositionInput = {
  price: number | null;
  costPrice: number;
  quantity: number;
  targetMin: number | null;
  targetMax: number | null;
  allocation: string | null;
  instrumentQuality: string | null;
  entryTiming: string | null;
};

export type WalletPositionStatus = {
  last: number | null;
  cost: number;
  quantity: number;
  marketValue: number | null;
  costValue: number;
  pnlAbs: number | null;
  pnlPct: number | null;
  vsCostPct: number | null;
  action: WalletActionLabel;
  band: {
    low: number;
    high: number;
    /** 0–1, where the current price sits between low and high. */
    fraction: number;
    hitMin: boolean;
    hitMax: boolean;
    hasUserBands: boolean;
  };
};

const LABELS: Record<WalletAction, Omit<WalletActionLabel, "action">> = {
  stay: {
    label: "Manter",
    hint: "O papel está dentro do plano. Não há motivo para vender nem para acelerar aportes.",
    tone: "neutral",
  },
  add: {
    label: "Comprar mais",
    hint: "A classe está favorável e o preço ainda não estourou o teto. Aportar mais é suportado.",
    tone: "positive",
  },
  leave: {
    label: "Sair",
    hint: "O preço bateu a sua banda, ou o motor pede para reduzir a exposição. Realize o plano.",
    tone: "negative",
  },
  falling: {
    label: "Tendência de queda — sair",
    hint: "A tendência da classe virou contra. Não é prejuízo realizado — é o vento mudando de direção.",
    tone: "caution",
  },
};

function num(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

export function walletPnl(price: number | null, cost: number, quantity: number) {
  const costValue = cost * quantity;
  if (price == null) {
    return {
      marketValue: null as number | null,
      costValue,
      pnlAbs: null as number | null,
      pnlPct: null as number | null,
      vsCostPct: null as number | null,
    };
  }
  const marketValue = price * quantity;
  const pnlAbs = marketValue - costValue;
  const pnlPct = costValue !== 0 ? (pnlAbs / costValue) * 100 : null;
  const vsCostPct = cost !== 0 ? ((price - cost) / cost) * 100 : null;
  return { marketValue, costValue, pnlAbs, pnlPct, vsCostPct };
}

export function walletBand(
  price: number | null,
  cost: number,
  targetMin: number | null,
  targetMax: number | null,
) {
  const hasUserBands = targetMin != null || targetMax != null;
  const low = targetMin ?? cost * 0.85;
  const high = targetMax ?? cost * 1.15;
  const span = high - low;
  const current = price ?? cost;
  const fraction =
    span <= 0 ? 0.5 : Math.max(0, Math.min(1, (current - low) / span));
  return {
    low,
    high,
    fraction,
    hitMin: targetMin != null && price != null && price <= targetMin,
    hitMax: targetMax != null && price != null && price >= targetMax,
    hasUserBands,
  };
}

function decideAction(input: {
  band: ReturnType<typeof walletBand>;
  allocation: string | null;
  quality: string | null;
  entry: string | null;
  vsCostPct: number | null;
}): WalletAction {
  const allocation = (input.allocation ?? "").toLowerCase();
  const quality = (input.quality ?? "").toLowerCase();
  const entry = (input.entry ?? "").toLowerCase();

  if (input.band.hitMax) return "leave";
  if (input.band.hitMin) return "leave";

  if (allocation.includes("strong reduce") || allocation.includes("fortedescendente")) {
    return "falling";
  }
  if (allocation.includes("reduce") || allocation.includes("descendente")) {
    return (input.vsCostPct ?? 0) < 0 ? "falling" : "leave";
  }

  const classSupportsAdd =
    allocation.includes("overweight") ||
    allocation.includes("accumulate") ||
    allocation.includes("ascendente");
  const paperIsWeak = quality === "weak";
  const notExtended = (input.vsCostPct ?? 0) <= 8 || entry === "buy";

  if (classSupportsAdd && !paperIsWeak && notExtended) return "add";

  return "stay";
}

export function evaluateWalletPosition(input: WalletPositionInput): WalletPositionStatus {
  const price = num(input.price);
  const cost = input.costPrice;
  const quantity = input.quantity;
  const pnl = walletPnl(price, cost, quantity);
  const band = walletBand(price, cost, input.targetMin, input.targetMax);
  const action = decideAction({
    band,
    allocation: input.allocation,
    quality: input.instrumentQuality,
    entry: input.entryTiming,
    vsCostPct: pnl.vsCostPct,
  });

  return {
    last: price,
    cost,
    quantity,
    ...pnl,
    action: { action, ...LABELS[action] },
    band,
  };
}

export function actionNeedsAlert(action: WalletAction): boolean {
  return action !== "stay";
}
