import { yahooFinance } from "@/lib/market/yahoo-client";

const REVALIDATE_SEC = 300;

export type YahooQuoteSummary = {
  symbol: string;
  currency: string | null;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  previousClose: number | null;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  dividendYield: number | null;
  epsTrailingTwelveMonths: number | null;
  beta: number | null;
  sharesFloat: number | null;
  totalRevenue: number | null;
  netIncome: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  longBusinessSummary: string | null;
  website: string | null;
  ceo: string | null;
  founded: number | null;
  employees: number | null;
  earningsDate: string | null;
  earningsQuarter: string | null;
  earningsEps: number | null;
  earningsRevenue: number | null;
  targetMeanPrice: number | null;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  recommendationKey: string | null;
  numberOfAnalystOpinions: number | null;
  error?: string;
};

function normalizeSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (s.includes(".")) {
    const [base, suffix] = s.split(".", 2);
    if (suffix === "A" || suffix === "B" || suffix === "C") {
      return `${base}-${suffix}`;
    }
  }
  return s;
}

function pickNum(v: unknown): number | null {
  if (v == null || typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function pickStr(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return v.trim();
}

export async function fetchYahooQuoteSummary(
  symbol: string,
): Promise<YahooQuoteSummary> {
  const sym = normalizeSymbol(symbol);
  const empty: YahooQuoteSummary = {
    symbol: sym,
    currency: null,
    price: null,
    change: null,
    changePercent: null,
    previousClose: null,
    marketCap: null,
    trailingPE: null,
    forwardPE: null,
    dividendYield: null,
    epsTrailingTwelveMonths: null,
    beta: null,
    sharesFloat: null,
    totalRevenue: null,
    netIncome: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    longBusinessSummary: null,
    website: null,
    ceo: null,
    founded: null,
    employees: null,
    earningsDate: null,
    earningsQuarter: null,
    earningsEps: null,
    earningsRevenue: null,
    targetMeanPrice: null,
    targetHighPrice: null,
    targetLowPrice: null,
    recommendationKey: null,
    numberOfAnalystOpinions: null,
  };

  try {
    const result = (await yahooFinance.quoteSummary(sym, {
      modules: [
        "price",
        "summaryDetail",
        "financialData",
        "defaultKeyStatistics",
        "summaryProfile",
        "calendarEvents",
        "earnings",
      ],
    })) as Record<string, Record<string, unknown> | undefined>;

    const price = result.price as Record<string, unknown> | undefined;
    const summary = result.summaryDetail as Record<string, unknown> | undefined;
    const financial = result.financialData as Record<string, unknown> | undefined;
    const stats = result.defaultKeyStatistics as Record<string, unknown> | undefined;
    const profile = result.summaryProfile as Record<string, unknown> | undefined;
    const calendar = result.calendarEvents as Record<string, unknown> | undefined;
    const earnings = result.earnings as {
      financialsChart?: {
        quarterly?: Array<{ date?: Date; earnings?: number; revenue?: number }>;
      };
    } | undefined;

    const earningsHistory = earnings?.financialsChart?.quarterly ?? [];
    const lastEarnings = earningsHistory.length
      ? earningsHistory[earningsHistory.length - 1]
      : null;

    let earningsDate: string | null = null;
    const earningsDates = calendar?.earnings as
      | { earningsDate?: Date[] }
      | undefined;
    const earnDate = earningsDates?.earningsDate?.[0];
    if (earnDate instanceof Date) {
      earningsDate = earnDate.toISOString().slice(0, 10);
    }

    return {
      symbol: sym,
      currency: pickStr(price?.currency),
      price: pickNum(price?.regularMarketPrice),
      change: pickNum(price?.regularMarketChange),
      changePercent: pickNum(price?.regularMarketChangePercent),
      previousClose: pickNum(
        summary?.previousClose ?? price?.regularMarketPreviousClose,
      ),
      marketCap: pickNum(summary?.marketCap ?? price?.marketCap),
      trailingPE: pickNum(summary?.trailingPE),
      forwardPE: pickNum(summary?.forwardPE),
      dividendYield: pickNum(summary?.dividendYield),
      epsTrailingTwelveMonths: pickNum(stats?.trailingEps ?? summary?.trailingEps),
      beta: pickNum(summary?.beta),
      sharesFloat: pickNum(stats?.floatShares),
      totalRevenue: pickNum(financial?.totalRevenue),
      netIncome: pickNum(financial?.netIncomeToCommon),
      fiftyTwoWeekHigh: pickNum(summary?.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: pickNum(summary?.fiftyTwoWeekLow),
      longBusinessSummary: pickStr(profile?.longBusinessSummary),
      website: pickStr(profile?.website),
      ceo: pickStr(
        (profile?.companyOfficers as Array<{ name?: string }> | undefined)?.[0]
          ?.name,
      ),
      founded: pickNum(
        profile?.startDate ? new Date(profile.startDate as string).getFullYear() : null,
      ),
      employees: pickNum(profile?.fullTimeEmployees),
      earningsDate,
      earningsQuarter: lastEarnings?.date
        ? new Date(lastEarnings.date).toISOString().slice(0, 10)
        : null,
      earningsEps: pickNum(lastEarnings?.earnings),
      earningsRevenue: pickNum(lastEarnings?.revenue),
      targetMeanPrice: pickNum(financial?.targetMeanPrice),
      targetHighPrice: pickNum(financial?.targetHighPrice),
      targetLowPrice: pickNum(financial?.targetLowPrice),
      recommendationKey: pickStr(financial?.recommendationKey),
      numberOfAnalystOpinions: pickNum(financial?.numberOfAnalystOpinions),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...empty, error: message };
  }
}

export async function fetchYahooQuoteSummaryCached(symbol: string): Promise<YahooQuoteSummary> {
  // yahoo-finance2 uses fetch internally; wrap with unstable_cache for SSR
  const { unstable_cache } = await import("next/cache");
  const cached = unstable_cache(
    () => fetchYahooQuoteSummary(symbol),
    [`yahoo-quote-${symbol.toUpperCase()}`],
    { revalidate: REVALIDATE_SEC },
  );
  return cached();
}
