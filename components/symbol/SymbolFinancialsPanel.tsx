import type { SymbolFinancials } from "@/lib/market/financials-types";
import { formatUsdCompact } from "@/lib/format-market";

function EmptyFinancials({ reason }: { reason: string }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-6 text-center">
      <p className="text-sm font-medium text-amber-200">
        Financial data is not available for this name.
      </p>
      <p className="mt-2 text-xs text-amber-200/80">{reason}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="text-base font-medium tabular-nums text-white">{value}</p>
    </div>
  );
}

function pct(v: number | null, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

function num(v: number | null, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export function SymbolFinancialsPanel({
  financials,
}: {
  financials: SymbolFinancials;
}) {
  const sources =
    financials.sources.length > 0
      ? financials.sources.map((s) => (s === "edgar" ? "SEC EDGAR" : "Yahoo")).join(" · ")
      : null;

  if (!financials.hasFinancialData) {
    return (
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-white">Financials</h3>
          {sources ? (
            <p className="text-[10px] text-zinc-600">Sources: {sources}</p>
          ) : null}
        </div>
        <EmptyFinancials
          reason={
            financials.emptyReason ??
            "No fundamentals from official sources (Yahoo Finance / SEC EDGAR)."
          }
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-white">
          {financials.isFund ? "Fund profile" : "Statements"}
        </h3>
        {sources ? (
          <p className="text-[10px] text-zinc-600">Sources: {sources}</p>
        ) : null}
      </div>

      {financials.isFund ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Family" value={financials.fundFamily ?? "—"} />
          <Stat label="Category" value={financials.fundCategory ?? "—"} />
          <Stat
            label="Expense ratio"
            value={
              financials.expenseRatio != null
                ? `${(financials.expenseRatio * 100).toFixed(2)}%`
                : "—"
            }
          />
          <Stat
            label="Assets (AUM)"
            value={formatUsdCompact(financials.totalAssets)}
          />
          <Stat label="Dividend yield" value={pct(financials.dividendYield)} />
          <Stat label="Market cap" value={formatUsdCompact(financials.marketCap)} />
        </div>
      ) : null}

      {financials.isCorporate || !financials.isFund ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Market capitalization" value={formatUsdCompact(financials.marketCap)} />
          <Stat label="Revenue (FY)" value={formatUsdCompact(financials.totalRevenue)} />
          <Stat label="Net income (FY)" value={formatUsdCompact(financials.netIncome)} />
          <Stat
            label="EPS (TTM / FY)"
            value={
              financials.epsTtm != null ? num(financials.epsTtm) : "—"
            }
          />
          <Stat label="P/E (TTM)" value={num(financials.trailingPE)} />
          <Stat label="Forward P/E" value={num(financials.forwardPE)} />
          <Stat label="Cash" value={formatUsdCompact(financials.totalCash)} />
          <Stat label="Total debt" value={formatUsdCompact(financials.totalDebt)} />
          <Stat label="Free cash flow" value={formatUsdCompact(financials.freeCashflow)} />
          <Stat label="Profit margin" value={pct(financials.profitMargins)} />
          <Stat label="ROE" value={pct(financials.returnOnEquity)} />
          <Stat label="Dividend yield" value={pct(financials.dividendYield)} />
          <Stat label="Revenue growth" value={pct(financials.revenueGrowth)} />
          <Stat label="Earnings growth" value={pct(financials.earningsGrowth)} />
          <Stat label="Beta (1Y)" value={num(financials.beta)} />
          <Stat
            label="Shares float"
            value={
              financials.sharesFloat != null
                ? formatUsdCompact(financials.sharesFloat, { suffix: "" })
                : "—"
            }
          />
          <Stat
            label="52-week high"
            value={formatUsdCompact(financials.fiftyTwoWeekHigh, { suffix: "" })}
          />
          <Stat
            label="52-week low"
            value={formatUsdCompact(financials.fiftyTwoWeekLow, { suffix: "" })}
          />
          <Stat
            label="Employees"
            value={financials.employees != null ? String(financials.employees) : "—"}
          />
          <Stat
            label="Founded"
            value={financials.founded != null ? String(financials.founded) : "—"}
          />
          <Stat label="CEO" value={financials.ceo ?? "—"} />
        </div>
      ) : null}

      {financials.annualStatements.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-zinc-400">Annual history</h4>
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-950 text-[11px] text-zinc-500">
                <tr>
                  <th className="px-3 py-2">FY</th>
                  <th className="px-3 py-2">Revenue</th>
                  <th className="px-3 py-2">Net income</th>
                  <th className="px-3 py-2">EPS</th>
                  <th className="px-3 py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {[...financials.annualStatements].reverse().map((row) => (
                  <tr key={row.date} className="border-b border-zinc-800/80">
                    <td className="px-3 py-2 text-zinc-300">{row.date}</td>
                    <td className="px-3 py-2 tabular-nums text-white">
                      {formatUsdCompact(row.revenue)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-white">
                      {formatUsdCompact(row.netIncome)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-white">
                      {row.eps != null ? num(row.eps) : "—"}
                    </td>
                    <td className="px-3 py-2 text-[10px] uppercase text-zinc-500">
                      {row.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {financials.website ? (
        <p className="text-xs text-zinc-500">
          Website:{" "}
          <a
            href={
              financials.website.startsWith("http")
                ? financials.website
                : `https://${financials.website}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 hover:underline"
          >
            {financials.website}
          </a>
        </p>
      ) : null}
    </section>
  );
}

export function SymbolEarningsPanel({
  financials,
}: {
  financials: SymbolFinancials;
}) {
  if (!financials.hasEarningsData) {
    return (
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-white">Earnings</h3>
        <EmptyFinancials reason="No earnings calendar or history from official sources for this name." />
      </section>
    );
  }

  const q = financials.latestQuarter;

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-white">Earnings</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Next date" value={financials.nextEarningsDate ?? "—"} />
        <Stat label="Last quarter" value={q?.date ?? "—"} />
        <Stat label="Revenue (Q)" value={formatUsdCompact(q?.revenue ?? null)} />
        <Stat
          label="EPS (Q)"
          value={q?.eps != null ? num(q.eps) : "—"}
        />
      </div>

      {financials.earningsHistory.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-950 text-[11px] text-zinc-500">
              <tr>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Actual EPS</th>
                <th className="px-3 py-2">Estimated EPS</th>
                <th className="px-3 py-2">Surprise</th>
              </tr>
            </thead>
            <tbody>
              {[...financials.earningsHistory].reverse().map((row, idx) => (
                <tr
                  key={`${row.period}-${row.date ?? idx}`}
                  className="border-b border-zinc-800/80"
                >
                  <td className="px-3 py-2 text-zinc-300">{row.period}</td>
                  <td className="px-3 py-2 text-zinc-400">{row.date ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums text-white">
                    {row.epsActual != null ? num(row.epsActual) : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-300">
                    {row.epsEstimate != null ? num(row.epsEstimate) : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-300">
                    {row.surprisePercent != null
                      ? `${(row.surprisePercent * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
