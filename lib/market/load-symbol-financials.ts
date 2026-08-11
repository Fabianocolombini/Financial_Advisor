import { yahooFinance } from "@/lib/market/yahoo-client";
import {
  emptySymbolFinancials,
  type AnnualStatementRow,
  type EarningsHistoryRow,
  type SymbolFinancials,
} from "./financials-types";
import { fetchEdgarCompanyFacts } from "./edgar-company-facts";

const REVALIDATE_SEC = 300;

function pickNum(v: unknown): number | null {
  if (v == null || typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function pickStr(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return v.trim();
}

function toDateStr(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return v.slice(0, 10);
  }
  return null;
}

function isFundType(quoteType: string | null): boolean {
  if (!quoteType) return false;
  const t = quoteType.toUpperCase();
  return t === "ETF" || t === "MUTUALFUND" || t === "MONEYMARKET";
}

function isCorporateType(quoteType: string | null): boolean {
  if (!quoteType) return false;
  const t = quoteType.toUpperCase();
  return t === "EQUITY";
}

type YfRow = Record<string, unknown>;

async function fetchYahooBundle(symbol: string): Promise<{
  quoteType: string | null;
  shortName: string | null;
  summary: YfRow;
  financial: YfRow;
  stats: YfRow;
  price: YfRow;
  profile: YfRow;
  calendar: YfRow;
  fundProfile: YfRow | null;
  earningsHistory: EarningsHistoryRow[];
  annualFromFts: AnnualStatementRow[];
  latestQuarter: SymbolFinancials["latestQuarter"];
  warning?: string;
}> {
  const empty = {
    quoteType: null as string | null,
    shortName: null as string | null,
    summary: {} as YfRow,
    financial: {} as YfRow,
    stats: {} as YfRow,
    price: {} as YfRow,
    profile: {} as YfRow,
    calendar: {} as YfRow,
    fundProfile: null as YfRow | null,
    earningsHistory: [] as EarningsHistoryRow[],
    annualFromFts: [] as AnnualStatementRow[],
    latestQuarter: null as SymbolFinancials["latestQuarter"],
  };

  try {
    const result = (await yahooFinance.quoteSummary(symbol, {
      modules: [
        "price",
        "quoteType",
        "summaryDetail",
        "financialData",
        "defaultKeyStatistics",
        "summaryProfile",
        "calendarEvents",
        "earnings",
        "earningsHistory",
        "earningsTrend",
        "fundProfile",
      ],
    })) as Record<string, unknown>;

    const quoteTypeObj = result.quoteType as YfRow | undefined;
    const earningsHistoryRaw = result.earningsHistory as
      | { history?: Array<Record<string, unknown>> }
      | undefined;

    const earningsHistory: EarningsHistoryRow[] = (earningsHistoryRaw?.history ?? [])
      .map((row) => ({
        period: pickStr(row.period) ?? "—",
        date: toDateStr(row.quarter),
        epsActual: pickNum(row.epsActual),
        epsEstimate: pickNum(row.epsEstimate),
        surprisePercent: pickNum(row.surprisePercent),
        currency: pickStr(row.currency),
      }))
      .filter(
        (r) =>
          r.epsActual != null ||
          r.epsEstimate != null ||
          r.surprisePercent != null,
      );

    let annualFromFts: AnnualStatementRow[] = [];
    let latestQuarter: SymbolFinancials["latestQuarter"] = null;

    try {
      const period1 = new Date();
      period1.setFullYear(period1.getFullYear() - 6);
      const period1Str = period1.toISOString().slice(0, 10);

      const annual = (await yahooFinance.fundamentalsTimeSeries(symbol, {
        period1: period1Str,
        type: "annual",
        module: "financials",
      })) as Array<Record<string, unknown>>;

      annualFromFts = annual
        .map((row) => ({
          date: toDateStr(row.date) ?? "—",
          revenue: pickNum(row.totalRevenue),
          netIncome: pickNum(row.netIncome ?? row.netIncomeCommonStockholders),
          eps: pickNum(row.basicEPS ?? row.dilutedEPS),
          source: "yahoo" as const,
        }))
        .filter((r) => r.revenue != null || r.netIncome != null || r.eps != null)
        .slice(-5);

      const quarterly = (await yahooFinance.fundamentalsTimeSeries(symbol, {
        period1: period1Str,
        type: "quarterly",
        module: "financials",
      })) as Array<Record<string, unknown>>;
      const lastQ = quarterly.at(-1);
      if (lastQ) {
        latestQuarter = {
          date: toDateStr(lastQ.date),
          revenue: pickNum(lastQ.totalRevenue),
          netIncome: pickNum(lastQ.netIncome ?? lastQ.netIncomeCommonStockholders),
          eps: pickNum(lastQ.basicEPS ?? lastQ.dilutedEPS),
        };
      }
    } catch {
      /* FTS often unavailable for ETFs — ignore */
    }

    // Balance-sheet cash / debt when financialData is thin
    let totalCashExtra: number | null = null;
    let totalDebtExtra: number | null = null;
    try {
      const period1 = new Date();
      period1.setFullYear(period1.getFullYear() - 3);
      const bs = (await yahooFinance.fundamentalsTimeSeries(symbol, {
        period1: period1.toISOString().slice(0, 10),
        type: "annual",
        module: "balance-sheet",
      })) as Array<Record<string, unknown>>;
      const last = bs.at(-1);
      if (last) {
        totalCashExtra = pickNum(
          last.cashAndCashEquivalents ?? last.cashCashEquivalentsAndShortTermInvestments,
        );
        totalDebtExtra = pickNum(last.totalDebt ?? last.longTermDebt);
      }
    } catch {
      /* ignore */
    }

    const financial = {
      ...((result.financialData as YfRow) ?? {}),
    };
    if (financial.totalCash == null && totalCashExtra != null) {
      financial.totalCash = totalCashExtra;
    }
    if (financial.totalDebt == null && totalDebtExtra != null) {
      financial.totalDebt = totalDebtExtra;
    }

    // Fallback revenue/NI from FTS into financialData-like fields
    const lastAnnual = annualFromFts.at(-1);
    if (financial.totalRevenue == null && lastAnnual?.revenue != null) {
      financial.totalRevenue = lastAnnual.revenue;
    }
    if (financial.netIncomeToCommon == null && lastAnnual?.netIncome != null) {
      financial.netIncomeToCommon = lastAnnual.netIncome;
    }

    return {
      quoteType: pickStr(quoteTypeObj?.quoteType),
      shortName: pickStr(quoteTypeObj?.shortName ?? quoteTypeObj?.longName),
      summary: (result.summaryDetail as YfRow) ?? {},
      financial,
      stats: (result.defaultKeyStatistics as YfRow) ?? {},
      price: (result.price as YfRow) ?? {},
      profile: (result.summaryProfile as YfRow) ?? {},
      calendar: (result.calendarEvents as YfRow) ?? {},
      fundProfile: (result.fundProfile as YfRow) ?? null,
      earningsHistory,
      annualFromFts,
      latestQuarter,
    };
  } catch (err) {
    return {
      ...empty,
      warning: err instanceof Error ? err.message : String(err),
    };
  }
}

function computeFlags(fin: SymbolFinancials): SymbolFinancials {
  const corporateBits = [
    fin.totalRevenue,
    fin.netIncome,
    fin.epsTtm,
    fin.totalCash,
    fin.trailingPE,
    fin.annualStatements.length > 0 ? 1 : null,
    fin.latestQuarter?.revenue,
    fin.latestQuarter?.netIncome,
  ].some((v) => v != null);

  const fundBits = [
    fin.fundCategory,
    fin.fundFamily,
    fin.expenseRatio,
    fin.totalAssets,
    fin.dividendYield,
  ].some((v) => v != null && v !== "");

  const hasEarnings =
    fin.earningsHistory.length > 0 ||
    fin.nextEarningsDate != null ||
    (fin.latestQuarter?.eps != null && fin.isCorporate);

  const hasFinancialData = fin.isFund ? fundBits || corporateBits : corporateBits;

  let emptyReason: string | null = null;
  if (!hasFinancialData) {
    if (fin.isFund) {
      emptyReason =
        "Este fundo/ETF não publica demonstrações corporativas no Yahoo/SEC. Exibimos perfil do fundo quando disponível.";
    } else {
      emptyReason =
        "Dados financeiros não disponíveis para este ativo nas fontes oficiais (Yahoo Finance / SEC EDGAR).";
    }
  }

  return {
    ...fin,
    hasFinancialData,
    hasEarningsData: hasEarnings,
    emptyReason: hasFinancialData ? null : emptyReason,
  };
}

export async function loadSymbolFinancials(symbol: string): Promise<SymbolFinancials> {
  const sym = symbol.trim().toUpperCase();
  const base = emptySymbolFinancials(sym);
  const yahoo = await fetchYahooBundle(sym);
  const sources: SymbolFinancials["sources"] = [];
  if (!yahoo.warning) sources.push("yahoo");
  if (yahoo.warning) base.warnings.push(`Yahoo: ${yahoo.warning}`);

  const fees = yahoo.fundProfile?.feesExpensesInvestment as YfRow | undefined;
  const quoteType = yahoo.quoteType;
  const isFund = isFundType(quoteType);
  const isCorporate = isCorporateType(quoteType) && !isFund;

  const fin: SymbolFinancials = {
    ...base,
    quoteType,
    shortName: yahoo.shortName,
    sources,
    isCorporate,
    isFund,
    marketCap: pickNum(yahoo.summary.marketCap ?? yahoo.price.marketCap),
    trailingPE: pickNum(yahoo.summary.trailingPE ?? yahoo.stats.trailingPE),
    forwardPE: pickNum(yahoo.summary.forwardPE ?? yahoo.stats.forwardPE),
    epsTtm: pickNum(yahoo.stats.trailingEps ?? yahoo.summary.trailingEps),
    dividendYield: pickNum(yahoo.summary.dividendYield ?? yahoo.summary.yield),
    beta: pickNum(yahoo.summary.beta ?? yahoo.stats.beta),
    totalRevenue: pickNum(yahoo.financial.totalRevenue),
    netIncome: pickNum(yahoo.financial.netIncomeToCommon),
    totalCash: pickNum(yahoo.financial.totalCash),
    totalDebt: pickNum(yahoo.financial.totalDebt),
    freeCashflow: pickNum(yahoo.financial.freeCashflow),
    operatingCashflow: pickNum(yahoo.financial.operatingCashflow),
    revenueGrowth: pickNum(yahoo.financial.revenueGrowth),
    earningsGrowth: pickNum(yahoo.financial.earningsGrowth),
    profitMargins: pickNum(yahoo.financial.profitMargins),
    returnOnEquity: pickNum(yahoo.financial.returnOnEquity),
    annualStatements: yahoo.annualFromFts,
    latestQuarter: yahoo.latestQuarter,
    nextEarningsDate: (() => {
      const earnings = yahoo.calendar.earnings as
        | { earningsDate?: unknown[] }
        | undefined;
      const first = earnings?.earningsDate?.[0];
      return toDateStr(first);
    })(),
    earningsHistory: yahoo.earningsHistory,
    fundCategory: pickStr(yahoo.fundProfile?.categoryName),
    fundFamily: pickStr(yahoo.fundProfile?.family),
    expenseRatio: pickNum(fees?.annualReportExpenseRatio),
    totalAssets: pickNum(yahoo.stats.totalAssets ?? fees?.totalNetAssets),
    longBusinessSummary: pickStr(yahoo.profile.longBusinessSummary),
    website: pickStr(yahoo.profile.website),
    ceo: pickStr(
      (yahoo.profile.companyOfficers as Array<{ name?: string }> | undefined)?.[0]
        ?.name,
    ),
    founded: (() => {
      const start = yahoo.profile.startDate;
      if (!start) return null;
      const d = start instanceof Date ? start : new Date(String(start));
      return Number.isNaN(d.getTime()) ? null : d.getFullYear();
    })(),
    employees: pickNum(yahoo.profile.fullTimeEmployees),
    sharesFloat: pickNum(yahoo.stats.floatShares),
    fiftyTwoWeekHigh: pickNum(yahoo.summary.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: pickNum(yahoo.summary.fiftyTwoWeekLow),
  };

  // Fill EPS TTM from latest annual FTS if missing
  if (fin.epsTtm == null) {
    const last = fin.annualStatements.at(-1);
    if (last?.eps != null) fin.epsTtm = last.eps;
  }

  const needsEdgar =
    (isCorporate || quoteType == null) &&
    !isFund &&
    (fin.totalRevenue == null ||
      fin.netIncome == null ||
      fin.annualStatements.length === 0);

  if (needsEdgar) {
    const edgar = await fetchEdgarCompanyFacts(sym);
    if (edgar) {
      fin.sources = [...fin.sources, "edgar"];
      if (quoteType == null) {
        fin.isCorporate = true;
      }
      if (fin.totalRevenue == null) fin.totalRevenue = edgar.totalRevenue;
      if (fin.netIncome == null) fin.netIncome = edgar.netIncome;
      if (fin.epsTtm == null) fin.epsTtm = edgar.epsDiluted;
      if (fin.totalCash == null) fin.totalCash = edgar.cash;
      if (fin.annualStatements.length === 0 && edgar.annual.length > 0) {
        fin.annualStatements = edgar.annual.map((row) => ({
          ...row,
          source: "edgar" as const,
        }));
      } else if (edgar.annual.length > 0) {
        const byDate = new Map(fin.annualStatements.map((r) => [r.date, r]));
        for (const row of edgar.annual) {
          const cur = byDate.get(row.date);
          if (!cur) {
            byDate.set(row.date, { ...row, source: "edgar" });
          } else {
            byDate.set(row.date, {
              ...cur,
              revenue: cur.revenue ?? row.revenue,
              netIncome: cur.netIncome ?? row.netIncome,
              eps: cur.eps ?? row.eps,
            });
          }
        }
        fin.annualStatements = [...byDate.values()].sort((a, b) =>
          a.date.localeCompare(b.date),
        );
      }
    }
  }

  return computeFlags(fin);
}

export async function loadSymbolFinancialsCached(
  symbol: string,
): Promise<SymbolFinancials> {
  const { unstable_cache } = await import("next/cache");
  const cached = unstable_cache(
    () => loadSymbolFinancials(symbol),
    [`symbol-financials-${symbol.toUpperCase()}`],
    { revalidate: REVALIDATE_SEC },
  );
  return cached();
}
