import type { YahooQuoteSummary } from "@/lib/market/yahoo-quote";
import { formatPerf, formatPrice, formatUsdCompact } from "@/lib/format-market";
import {
  countIndicatorActions,
  ratingBadgeClass,
  scoreToRating,
} from "@/lib/motor/format-scores";
import type { MotorIndicatorSnapshot } from "@/lib/motor/snapshot-types";
import { SymbolPriceChart } from "./SymbolPriceChart";

export function MotorForecastCard({
  score,
  indicators,
}: {
  score: number | null;
  indicators: MotorIndicatorSnapshot[];
}) {
  const rating = scoreToRating(score);
  const counts = countIndicatorActions(indicators);

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 space-y-2">
      <h3 className="text-sm font-medium text-white">Motor forecast</h3>
      <p className={`text-2xl font-semibold ${ratingBadgeClass(rating)}`}>{rating}</p>
      <p className="text-sm text-zinc-400">
        Based on motor composite score and {indicators.length} indicator
        {indicators.length === 1 ? "" : "s"} in snapshot.
      </p>
      <p className="text-xs text-zinc-500">
        Buy {counts.buy} · Neutral {counts.neutral} · Sell {counts.sell}
      </p>
      <p className="text-[11px] text-zinc-600">
        Educacional — não é recomendação de investimento regulada.
      </p>
    </section>
  );
}

function pctVsCurrent(current: number | null, target: number | null): string | null {
  if (current == null || target == null || current <= 0) return null;
  const pct = ((target - current) / current) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function AnalystForecastCard({
  quote,
  bars,
}: {
  quote: YahooQuoteSummary;
  bars: Array<{ date: string; value: number }>;
}) {
  const price = quote.price;
  const hasTargets =
    quote.targetMeanPrice != null ||
    quote.targetHighPrice != null ||
    quote.targetLowPrice != null;

  if (!hasTargets && !quote.recommendationKey) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-black p-4 space-y-2">
        <h3 className="text-sm font-medium text-white">Analyst forecast</h3>
        <p className="text-sm text-zinc-500">
          Sem dados de analistas externos para este papel (comum em ETFs, ADRs ou empresas
          privadas). Use o motor forecast acima.
        </p>
      </section>
    );
  }

  const meanPct = pctVsCurrent(price, quote.targetMeanPrice);
  const highPct = pctVsCurrent(price, quote.targetHighPrice);
  const lowPct = pctVsCurrent(price, quote.targetLowPrice);

  return (
    <section className="space-y-4 rounded-lg border border-zinc-800 bg-black p-4">
      <h3 className="text-sm font-medium text-white">Analyst forecast</h3>
      {quote.targetMeanPrice != null ? (
        <div>
          <p className="text-2xl font-semibold text-white">
            {formatPrice(quote.targetMeanPrice)} {quote.currency ?? "USD"}
          </p>
          {meanPct ? (
            <p className="text-sm text-emerald-400">{meanPct} vs current</p>
          ) : null}
        </div>
      ) : null}
      {quote.numberOfAnalystOpinions != null ? (
        <p className="text-xs text-zinc-500">
          Based on {quote.numberOfAnalystOpinions} analyst
          {quote.numberOfAnalystOpinions === 1 ? "" : "s"} (Yahoo Finance).
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3 text-sm">
        <div>
          <p className="text-[11px] text-zinc-500">Max target</p>
          <p className="text-white">{formatPrice(quote.targetHighPrice)}</p>
          {highPct ? <p className="text-xs text-zinc-400">{highPct}</p> : null}
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Avg target</p>
          <p className="text-white">{formatPrice(quote.targetMeanPrice)}</p>
          {meanPct ? <p className="text-xs text-zinc-400">{meanPct}</p> : null}
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Min target</p>
          <p className="text-white">{formatPrice(quote.targetLowPrice)}</p>
          {lowPct ? <p className="text-xs text-zinc-400">{lowPct}</p> : null}
        </div>
      </div>
      {quote.recommendationKey ? (
        <p className="text-sm text-zinc-300">
          Consensus: <span className="capitalize text-white">{quote.recommendationKey}</span>
        </p>
      ) : null}
      {bars.length >= 2 && price != null ? (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500">Price vs targets (2Y history)</p>
          <SymbolPriceChart bars={bars} previousClose={price} />
          <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
            <span>Current {formatPrice(price)}</span>
            {quote.targetMeanPrice != null ? (
              <span className="text-teal-400/80">Avg {formatPrice(quote.targetMeanPrice)}</span>
            ) : null}
            {quote.targetHighPrice != null ? (
              <span className="text-teal-400/80">Max {formatPrice(quote.targetHighPrice)}</span>
            ) : null}
            {quote.targetLowPrice != null ? (
              <span className="text-red-400/80">Min {formatPrice(quote.targetLowPrice)}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
