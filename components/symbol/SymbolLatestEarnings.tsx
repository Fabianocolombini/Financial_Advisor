import type { YahooQuoteSummary } from "@/lib/market/yahoo-quote";
import { formatUsdCompact } from "@/lib/format-market";

export function SymbolLatestEarnings({ quote }: { quote: YahooQuoteSummary }) {
  const hasData =
    quote.earningsDate ||
    quote.earningsQuarter ||
    quote.earningsEps != null ||
    quote.earningsRevenue != null;

  if (!hasData) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-white">Latest earnings</h3>
        <p className="text-sm text-zinc-500">Dados de earnings não disponíveis para este papel.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium text-white">Latest earnings</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] text-zinc-500">Last report date</p>
          <p className="text-base font-medium text-white">{quote.earningsDate ?? "—"}</p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Report period</p>
          <p className="text-base font-medium text-white">{quote.earningsQuarter ?? "—"}</p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">EPS</p>
          <p className="text-base font-medium text-white">
            {quote.earningsEps != null
              ? `${quote.earningsEps.toFixed(2)} ${quote.currency ?? "USD"}`
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Revenue</p>
          <p className="text-base font-medium text-white">
            {formatUsdCompact(quote.earningsRevenue)}
          </p>
        </div>
      </div>
    </section>
  );
}
