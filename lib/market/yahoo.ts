export type YahooBar = {
  date: string;
  value: number;
  raw: { timestamp: number; close: number };
};

type YahooChartJson = {
  chart?: {
    result?: Array<{
      timestamp: number[];
      indicators?: {
        quote?: Array<{ close: Array<number | null> }>;
      };
    }>;
    error?: { description?: string };
  };
};

const YAHOO_UA =
  "Mozilla/5.0 (compatible; FinancialAdvisor/1.0; +https://github.com/Fabianocolombini/Financial_Advisor)";

/**
 * Histórico diário via endpoint chart v8 (não oficial; pode mudar).
 * `period1` / `period2` em segundos Unix.
 */
export async function fetchYahooChartCloses(
  symbol: string,
  period1Sec: number,
  period2Sec: number,
): Promise<YahooBar[]> {
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
  );
  url.searchParams.set("interval", "1d");
  url.searchParams.set("period1", String(period1Sec));
  url.searchParams.set("period2", String(period2Sec));

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
    next: { revalidate: 0 },
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
  if (!result?.timestamp?.length) return [];

  const closes = result.indicators?.quote?.[0]?.close;
  if (!closes || closes.length !== result.timestamp.length) return [];

  const out: YahooBar[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const ts = result.timestamp[i];
    const c = closes[i];
    if (c == null || !Number.isFinite(c)) continue;
    const d = new Date(ts * 1000);
    const date = d.toISOString().slice(0, 10);
    out.push({ date, value: c, raw: { timestamp: ts, close: c } });
  }

  return out;
}
