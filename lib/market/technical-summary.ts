import type { YahooBar } from "./yahoo";
import type { IndicatorAction } from "@/lib/motor/format-scores";

export type TechnicalIndicatorRow = {
  id: string;
  name: string;
  value: number | null;
  action: IndicatorAction;
  group: "oscillator" | "moving_average";
};

function closes(bars: YahooBar[]): number[] {
  return bars.map((b) => b.value);
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let emaVal = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    emaVal = values[i] * k + emaVal * (1 - k);
  }
  return emaVal;
}

function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function stochasticK(values: number[], period = 14): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const low = Math.min(...slice);
  const high = Math.max(...slice);
  const close = slice[slice.length - 1];
  if (high === low) return 50;
  return ((close - low) / (high - low)) * 100;
}

function macdLevel(values: number[]): number | null {
  const e12 = ema(values, 12);
  const e26 = ema(values, 26);
  if (e12 == null || e26 == null) return null;
  return e12 - e26;
}

function momentum(values: number[], period = 10): number | null {
  if (values.length < period + 1) return null;
  return values[values.length - 1] - values[values.length - 1 - period];
}

function priceVsMaAction(price: number, ma: number | null): IndicatorAction {
  if (ma == null) return "Neutral";
  if (price > ma * 1.001) return "Buy";
  if (price < ma * 0.999) return "Sell";
  return "Neutral";
}

function rsiAction(rsiVal: number | null): IndicatorAction {
  if (rsiVal == null) return "Neutral";
  if (rsiVal < 30) return "Buy";
  if (rsiVal > 70) return "Sell";
  return "Neutral";
}

function stochasticAction(k: number | null): IndicatorAction {
  if (k == null) return "Neutral";
  if (k < 20) return "Buy";
  if (k > 80) return "Sell";
  return "Neutral";
}

function macdAction(macd: number | null): IndicatorAction {
  if (macd == null) return "Neutral";
  if (macd > 0) return "Buy";
  if (macd < 0) return "Sell";
  return "Neutral";
}

function momentumAction(m: number | null): IndicatorAction {
  if (m == null) return "Neutral";
  if (m > 0) return "Buy";
  if (m < 0) return "Sell";
  return "Neutral";
}

export function computeTechnicalSummary(bars: YahooBar[]): TechnicalIndicatorRow[] {
  if (bars.length < 30) return [];
  const values = closes(bars);
  const price = values[values.length - 1];

  const rsiVal = rsi(values, 14);
  const stoch = stochasticK(values, 14);
  const macd = macdLevel(values);
  const mom = momentum(values, 10);

  const rows: TechnicalIndicatorRow[] = [
    {
      id: "rsi_14",
      name: "Relative Strength Index (14)",
      value: rsiVal,
      action: rsiAction(rsiVal),
      group: "oscillator",
    },
    {
      id: "stoch_k",
      name: "Stochastic %K (14)",
      value: stoch,
      action: stochasticAction(stoch),
      group: "oscillator",
    },
    {
      id: "macd",
      name: "MACD Level (12, 26)",
      value: macd,
      action: macdAction(macd),
      group: "oscillator",
    },
    {
      id: "momentum_10",
      name: "Momentum (10)",
      value: mom,
      action: momentumAction(mom),
      group: "oscillator",
    },
  ];

  for (const [period, label] of [
    [10, "10"],
    [20, "20"],
    [30, "30"],
    [50, "50"],
    [100, "100"],
    [200, "200"],
  ] as const) {
    const smaVal = sma(values, period);
    rows.push({
      id: `sma_${period}`,
      name: `Simple Moving Average (${label})`,
      value: smaVal,
      action: priceVsMaAction(price, smaVal),
      group: "moving_average",
    });
    const emaVal = ema(values, period);
    rows.push({
      id: `ema_${period}`,
      name: `Exponential Moving Average (${label})`,
      value: emaVal,
      action: priceVsMaAction(price, emaVal),
      group: "moving_average",
    });
  }

  return rows;
}

export function countTaActions(rows: TechnicalIndicatorRow[]): {
  buy: number;
  neutral: number;
  sell: number;
} {
  let buy = 0;
  let neutral = 0;
  let sell = 0;
  for (const row of rows) {
    if (row.action === "Buy") buy += 1;
    else if (row.action === "Sell") sell += 1;
    else neutral += 1;
  }
  return { buy, neutral, sell };
}

/** % change between latest and lookback trading-day rows. */
export function perfFromBars(bars: YahooBar[], lookback: number): number | null {
  if (bars.length < lookback + 1) return null;
  const latest = bars[bars.length - 1].value;
  const prior = bars[bars.length - 1 - lookback].value;
  if (!prior) return null;
  return ((latest - prior) / prior) * 100;
}
