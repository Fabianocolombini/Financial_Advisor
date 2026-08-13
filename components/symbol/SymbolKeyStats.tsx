import Link from "next/link";
import type { SymbolFinancials } from "@/lib/market/financials-types";
import { formatUsdCompact } from "@/lib/format-market";

type StatItem = { label: string; value: string };

function buildPreviewStats(financials: SymbolFinancials): StatItem[] {
  if (financials.isFund && !financials.isCorporate) {
    return [
      {
        label: "Fund family",
        value: financials.fundFamily ?? "—",
      },
      {
        label: "Category",
        value: financials.fundCategory ?? "—",
      },
      {
        label: "Expense ratio",
        value:
          financials.expenseRatio != null
            ? `${(financials.expenseRatio * 100).toFixed(2)}%`
            : "—",
      },
      {
        label: "AUM",
        value: formatUsdCompact(financials.totalAssets),
      },
      {
        label: "Dividend yield",
        value:
          financials.dividendYield != null
            ? `${(financials.dividendYield * 100).toFixed(2)}%`
            : "—",
      },
      {
        label: "Market capitalization",
        value: formatUsdCompact(financials.marketCap),
      },
    ];
  }

  return [
    {
      label: "Market capitalization",
      value: formatUsdCompact(financials.marketCap),
    },
    {
      label: "Dividend yield (indicated)",
      value:
        financials.dividendYield != null
          ? `${(financials.dividendYield * 100).toFixed(2)}%`
          : "—",
    },
    {
      label: "Price to earnings Ratio (TTM)",
      value:
        financials.trailingPE != null ? financials.trailingPE.toFixed(2) : "—",
    },
    {
      label: "Basic EPS (TTM)",
      value: financials.epsTtm != null ? financials.epsTtm.toFixed(2) : "—",
    },
    {
      label: "Net income (FY)",
      value: formatUsdCompact(financials.netIncome),
    },
    {
      label: "Revenue (FY)",
      value: formatUsdCompact(financials.totalRevenue),
    },
  ];
}

export function SymbolKeyStatsPreview({
  financials,
  symbol,
}: {
  financials: SymbolFinancials;
  symbol: string;
}) {
  if (!financials.hasFinancialData) {
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">Key stats</h3>
          <Link
            href={`/mercado/${symbol}?tab=financials`}
            className="text-xs text-sky-400 hover:text-sky-300"
          >
            See Financials →
          </Link>
        </div>
        <p className="rounded border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-zinc-500">
          {financials.emptyReason ??
            "Financial data is not available for this name."}
        </p>
      </section>
    );
  }

  const stats = buildPreviewStats(financials);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">Key stats</h3>
        <Link
          href={`/mercado/${symbol}?tab=financials`}
          className="text-xs text-sky-400 hover:text-sky-300"
        >
          See Financials →
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
