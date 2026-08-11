/** Unified financials / earnings for symbol detail (Yahoo + SEC EDGAR). */

export type FinancialSource = "yahoo" | "edgar";

export type AnnualStatementRow = {
  date: string;
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
  source: FinancialSource;
};

export type EarningsHistoryRow = {
  period: string;
  date: string | null;
  epsActual: number | null;
  epsEstimate: number | null;
  surprisePercent: number | null;
  currency: string | null;
};

export type SymbolFinancials = {
  symbol: string;
  quoteType: string | null;
  shortName: string | null;
  sources: FinancialSource[];
  hasFinancialData: boolean;
  hasEarningsData: boolean;
  /** Corporate-style statements exist (equity / BDC / similar). */
  isCorporate: boolean;
  /** ETF / mutual fund profile available. */
  isFund: boolean;

  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  epsTtm: number | null;
  dividendYield: number | null;
  beta: number | null;
  totalRevenue: number | null;
  netIncome: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  freeCashflow: number | null;
  operatingCashflow: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  profitMargins: number | null;
  returnOnEquity: number | null;

  annualStatements: AnnualStatementRow[];
  latestQuarter: {
    date: string | null;
    revenue: number | null;
    netIncome: number | null;
    eps: number | null;
  } | null;

  nextEarningsDate: string | null;
  earningsHistory: EarningsHistoryRow[];

  fundCategory: string | null;
  fundFamily: string | null;
  expenseRatio: number | null;
  totalAssets: number | null;

  longBusinessSummary: string | null;
  website: string | null;
  ceo: string | null;
  employees: number | null;
  founded: number | null;
  sharesFloat: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;

  emptyReason: string | null;
  warnings: string[];
};

export function emptySymbolFinancials(symbol: string): SymbolFinancials {
  return {
    symbol,
    quoteType: null,
    shortName: null,
    sources: [],
    hasFinancialData: false,
    hasEarningsData: false,
    isCorporate: false,
    isFund: false,
    marketCap: null,
    trailingPE: null,
    forwardPE: null,
    epsTtm: null,
    dividendYield: null,
    beta: null,
    totalRevenue: null,
    netIncome: null,
    totalCash: null,
    totalDebt: null,
    freeCashflow: null,
    operatingCashflow: null,
    revenueGrowth: null,
    earningsGrowth: null,
    profitMargins: null,
    returnOnEquity: null,
    annualStatements: [],
    latestQuarter: null,
    nextEarningsDate: null,
    earningsHistory: [],
    fundCategory: null,
    fundFamily: null,
    expenseRatio: null,
    totalAssets: null,
    longBusinessSummary: null,
    website: null,
    ceo: null,
    employees: null,
    founded: null,
    sharesFloat: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    emptyReason: null,
    warnings: [],
  };
}
