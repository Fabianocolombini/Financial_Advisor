import Link from "next/link";
import type { YahooQuoteSummary } from "@/lib/market/yahoo-quote";
import { formatUsdCompact } from "@/lib/format-market";

type StatItem = { label: string; value: string };

function buildPreviewStats(quote: YahooQuoteSummary): StatItem[] {
  return [
    {
      label: "Market capitalization",
      value: formatUsdCompact(quote.marketCap),
    },
    {
      label: "Dividend yield (indicated)",
      value:
        quote.dividendYield != null
          ? `${(quote.dividendYield * 100).toFixed(2)}%`
          : "—",
    },
    {
      label: "Price to earnings Ratio (TTM)",
      value: quote.trailingPE != null ? quote.trailingPE.toFixed(2) : "—",
    },
    {
      label: "Basic EPS (TTM)",
      value:
        quote.epsTrailingTwelveMonths != null
          ? `${quote.epsTrailingTwelveMonths.toFixed(2)} ${quote.currency ?? "USD"}`
          : "—",
    },
    {
      label: "Net income (FY)",
      value: formatUsdCompact(quote.netIncome),
    },
    {
      label: "Revenue (FY)",
      value: formatUsdCompact(quote.totalRevenue),
    },
  ];
}

export function SymbolKeyStatsPreview({
  quote,
  symbol,
}: {
  quote: YahooQuoteSummary;
  symbol: string;
}) {
  const stats = buildPreviewStats(quote);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">Key stats</h3>
        <Link
          href={`/mercado/${symbol}?tab=financials`}
          className="text-xs text-sky-400 hover:text-sky-300"
        >
          Ver Financials →
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-[11px] text-zinc-500">{s.label}</p>
            <p className="text-base font-medium text-white">{s.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SymbolKeyStats({ quote }: { quote: YahooQuoteSummary }) {
  const stats: StatItem[] = [
    ...buildPreviewStats(quote),
    {
      label: "Shares float",
      value:
        quote.sharesFloat != null
          ? formatUsdCompact(quote.sharesFloat, { suffix: "" })
          : "—",
    },
    { label: "Beta (1Y)", value: quote.beta != null ? quote.beta.toFixed(2) : "—" },
    { label: "Forward P/E", value: quote.forwardPE != null ? quote.forwardPE.toFixed(2) : "—" },
    { label: "52-week high", value: formatUsdCompact(quote.fiftyTwoWeekHigh, { suffix: "" }) },
    { label: "52-week low", value: formatUsdCompact(quote.fiftyTwoWeekLow, { suffix: "" }) },
    { label: "Founded", value: quote.founded != null ? String(quote.founded) : "—" },
    { label: "Employees (FY)", value: quote.employees != null ? String(quote.employees) : "—" },
    { label: "CEO", value: quote.ceo ?? "—" },
    {
      label: "Website",
      value: quote.website ?? "—",
    },
  ];

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium text-white">Key stats</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-[11px] text-zinc-500">{s.label}</p>
            {s.label === "Website" && quote.website ? (
              <a
                href={quote.website.startsWith("http") ? quote.website : `https://${quote.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base font-medium text-sky-400 hover:underline"
              >
                {quote.website}
              </a>
            ) : (
              <p className="text-base font-medium text-white">{s.value}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
