/**
 * SEC EDGAR company facts (XBRL) — official free source for US issuers.
 * https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
 */

export type EdgarCompanyFactsSnapshot = {
  cik: string;
  entityName: string | null;
  totalRevenue: number | null;
  netIncome: number | null;
  epsDiluted: number | null;
  cash: number | null;
  fiscalYearEnd: string | null;
  filed: string | null;
  annual: Array<{
    date: string;
    revenue: number | null;
    netIncome: number | null;
    eps: number | null;
  }>;
};

const SEC_HEADERS = {
  "User-Agent": "FinancialAdvisor/1.0 (financial-advisor; contact@example.com)",
  Accept: "application/json",
};

const TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json";
const FACTS_URL = (cik10: string) =>
  `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`;

type FactUnit = {
  end?: string;
  val?: number;
  form?: string;
  fp?: string;
  filed?: string;
  fy?: number;
};

function pickLatestFy(units: FactUnit[]): FactUnit | null {
  const fy = units.filter((u) => u.fp === "FY" && u.val != null && Number.isFinite(u.val));
  if (fy.length === 0) return null;
  fy.sort((a, b) => String(a.end ?? "").localeCompare(String(b.end ?? "")));
  return fy[fy.length - 1] ?? null;
}

function annualSeries(
  units: FactUnit[],
  limit = 5,
): Array<{ date: string; value: number }> {
  const fy = units
    .filter((u) => u.fp === "FY" && u.val != null && Number.isFinite(u.val) && u.end)
    .map((u) => ({ date: String(u.end), value: Number(u.val) }));
  const byDate = new Map<string, number>();
  for (const row of fy) byDate.set(row.date, row.value);
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-limit)
    .map(([date, value]) => ({ date, value }));
}

function unitsFor(
  facts: Record<string, { units?: Record<string, FactUnit[]> }>,
  keys: string[],
): FactUnit[] {
  for (const key of keys) {
    const node = facts[key];
    if (!node?.units) continue;
    const usd = node.units.USD ?? node.units["USD/shares"];
    if (usd?.length) return usd;
    const first = Object.values(node.units)[0];
    if (first?.length) return first;
  }
  return [];
}

let tickerCikCache: Map<string, string> | null = null;

async function loadTickerCikMap(): Promise<Map<string, string>> {
  if (tickerCikCache) return tickerCikCache;
  const res = await fetch(TICKER_MAP_URL, {
    headers: SEC_HEADERS,
    next: { revalidate: 86400 },
  } as RequestInit);
  if (!res.ok) throw new Error(`SEC ticker map HTTP ${res.status}`);
  const data = (await res.json()) as Record<
    string,
    { cik_str: number | string; ticker: string }
  >;
  const map = new Map<string, string>();
  for (const row of Object.values(data)) {
    if (!row?.ticker) continue;
    map.set(String(row.ticker).toUpperCase(), String(row.cik_str).padStart(10, "0"));
  }
  tickerCikCache = map;
  return map;
}

export async function resolveCik(ticker: string): Promise<string | null> {
  const map = await loadTickerCikMap();
  return map.get(ticker.trim().toUpperCase()) ?? null;
}

export async function fetchEdgarCompanyFacts(
  ticker: string,
): Promise<EdgarCompanyFactsSnapshot | null> {
  const sym = ticker.trim().toUpperCase();
  try {
    const cik = await resolveCik(sym);
    if (!cik) return null;

    const res = await fetch(FACTS_URL(cik), {
      headers: SEC_HEADERS,
      next: { revalidate: 86400 },
    } as RequestInit);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      entityName?: string;
      facts?: {
        "us-gaap"?: Record<string, { units?: Record<string, FactUnit[]> }>;
        "ifrs-full"?: Record<string, { units?: Record<string, FactUnit[]> }>;
      };
    };

    const gaap = data.facts?.["us-gaap"] ?? {};
    const revenueUnits = unitsFor(gaap, [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "Revenues",
      "SalesRevenueNet",
      "RevenueFromContractWithCustomerIncludingAssessedTax",
    ]);
    const incomeUnits = unitsFor(gaap, ["NetIncomeLoss", "ProfitLoss"]);
    const epsUnits = unitsFor(gaap, [
      "EarningsPerShareDiluted",
      "EarningsPerShareBasic",
    ]);
    const cashUnits = unitsFor(gaap, [
      "CashAndCashEquivalentsAtCarryingValue",
      "Cash",
    ]);

    const revFy = pickLatestFy(revenueUnits);
    const niFy = pickLatestFy(incomeUnits);
    const epsFy = pickLatestFy(epsUnits);
    const cashFy = pickLatestFy(cashUnits);

    const revAnnual = annualSeries(revenueUnits);
    const niAnnual = annualSeries(incomeUnits);
    const epsAnnual = annualSeries(epsUnits);
    const dates = new Set([
      ...revAnnual.map((r) => r.date),
      ...niAnnual.map((r) => r.date),
      ...epsAnnual.map((r) => r.date),
    ]);
    const annual = [...dates]
      .sort()
      .slice(-5)
      .map((date) => ({
        date,
        revenue: revAnnual.find((r) => r.date === date)?.value ?? null,
        netIncome: niAnnual.find((r) => r.date === date)?.value ?? null,
        eps: epsAnnual.find((r) => r.date === date)?.value ?? null,
      }));

    if (!revFy && !niFy && annual.length === 0) return null;

    return {
      cik,
      entityName: data.entityName ?? null,
      totalRevenue: revFy?.val ?? null,
      netIncome: niFy?.val ?? null,
      epsDiluted: epsFy?.val ?? null,
      cash: cashFy?.val ?? null,
      fiscalYearEnd: revFy?.end ?? niFy?.end ?? null,
      filed: revFy?.filed ?? niFy?.filed ?? null,
      annual,
    };
  } catch {
    return null;
  }
}
