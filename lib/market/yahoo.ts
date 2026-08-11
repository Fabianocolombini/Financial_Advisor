export type YahooBar = {
  date: string;
  value: number;
  volume: number;
  open?: number;
  high?: number;
  low?: number;
  /** Split + dividend adjusted close, when Yahoo returns adjclose. */
  adjClose?: number;
  raw: { timestamp: number; close: number; volume: number };
};

type YahooChartJson = {
  chart?: {
    result?: Array<{
      timestamp: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close: Array<number | null>;
          volume?: Array<number | null>;
        }>;
        adjclose?: Array<{ adjclose?: Array<number | null> }>;
      };
      events?: {
        dividends?: Record<string, { amount?: number; date?: number }>;
        splits?: Record<string, { numerator?: number; denominator?: number; date?: number }>;
      };
    }>;
    error?: { description?: string };
  };
};

export type YahooDistribution = { date: string; amount: number };

const YAHOO_UA =
  "Mozilla/5.0 (compatible; FinancialAdvisor/1.0; +https://github.com/Fabianocolombini/Financial_Advisor)";

function finite(value: number | null | undefined): number | undefined {
  return value != null && Number.isFinite(value) ? value : undefined;
}

/**
 * Histórico diário via endpoint chart v8 (não oficial; pode mudar).
 * `period1` / `period2` em segundos Unix.
 *
 * Retorna OHLC + volume + adjusted close. O adjusted close importa para ETFs de
 * caixa: as distribuições mensais derrubam o preço sem que haja perda, e sinais
 * calculados só sobre o close puro leem isso como fraqueza.
 */
export async function fetchYahooChartCloses(
  symbol: string,
  period1Sec: number,
  period2Sec: number,
  revalidateSec = 0,
): Promise<YahooBar[]> {
  const { bars } = await fetchYahooChart(symbol, period1Sec, period2Sec, revalidateSec);
  return bars;
}

export async function fetchYahooChart(
  symbol: string,
  period1Sec: number,
  period2Sec: number,
  revalidateSec = 0,
): Promise<{ bars: YahooBar[]; distributions: YahooDistribution[] }> {
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
  );
  url.searchParams.set("interval", "1d");
  url.searchParams.set("period1", String(period1Sec));
  url.searchParams.set("period2", String(period2Sec));
  url.searchParams.set("events", "div,split");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
    next: { revalidate: revalidateSec },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Yahoo chart HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as YahooChartJson;
  const err = json.chart?.error;
  if (err?.description) {
    throw new Error(`Yahoo chart error: ${err.description}`);
  }

  const result = json.chart?.result?.[0];
  if (!result?.timestamp?.length) return { bars: [], distributions: [] };

  const quote = result.indicators?.quote?.[0];
  const closes = quote?.close;
  if (!closes || closes.length !== result.timestamp.length) {
    return { bars: [], distributions: [] };
  }
  const adjCloses = result.indicators?.adjclose?.[0]?.adjclose;

  const bars: YahooBar[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const ts = result.timestamp[i];
    const c = closes[i];
    if (c == null || !Number.isFinite(c)) continue;
    const v = quote?.volume?.[i];
    const volume = v != null && Number.isFinite(v) ? v : 0;
    const d = new Date(ts * 1000);
    const date = d.toISOString().slice(0, 10);
    bars.push({
      date,
      value: c,
      volume,
      open: finite(quote?.open?.[i]),
      high: finite(quote?.high?.[i]),
      low: finite(quote?.low?.[i]),
      adjClose: finite(adjCloses?.[i]),
      raw: { timestamp: ts, close: c, volume },
    });
  }

  const distributions: YahooDistribution[] = [];
  for (const entry of Object.values(result.events?.dividends ?? {})) {
    if (entry?.amount == null || entry.date == null) continue;
    distributions.push({
      date: new Date(entry.date * 1000).toISOString().slice(0, 10),
      amount: entry.amount,
    });
  }
  distributions.sort((a, b) => a.date.localeCompare(b.date));

  return { bars, distributions };
}
