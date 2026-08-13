"use client";

import { useMemo } from "react";
import type { YahooQuoteSummary } from "@/lib/market/yahoo-quote";
import { formatPrice } from "@/lib/format-market";
import type {
  ForecastScenario,
  PriceForecast,
} from "@/lib/market/forecast-model";
import type { ChartBar } from "@/lib/market/chart-overlays";
import {
  buildPivotTable,
  pivotTargets,
  type PivotSourceBar,
} from "@/lib/market/pivot-points";
import { SymbolPriceChart, type ChartPriceLine } from "./SymbolPriceChart";
import { InfoTooltip } from "./InfoTooltip";

function pct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function coverageLabel(coverage: number | null, nominal: number): string {
  if (coverage == null) return "insufficient sample";
  const diff = coverage - nominal;
  const quality =
    Math.abs(diff) <= 0.05
      ? "well calibrated"
      : diff > 0
        ? "conservative (hit more than the nominal)"
        : "optimistic (hit less than the nominal)";
  return `${(coverage * 100).toFixed(0)}% out of sample — ${quality}`;
}

function ScenarioCard({
  scenario,
  current,
  stability,
}: {
  scenario: ForecastScenario;
  current: number | null;
  stability: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{scenario.label}</p>
      <p className="mt-2 text-xl font-medium tabular-nums text-white">
        {formatPrice(scenario.central)}
      </p>
      <p className="text-xs text-zinc-400">
        central scenario · {pct(scenario.centralChangePct)} vs current
      </p>

      <dl className="mt-3 space-y-1.5 border-t border-zinc-800 pt-3 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-zinc-500">Likely range (68%)</dt>
          <dd className="tabular-nums text-zinc-200">
            {formatPrice(scenario.low68)} – {formatPrice(scenario.high68)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-zinc-500">Wide range (95%)</dt>
          <dd className="tabular-nums text-zinc-400">
            {formatPrice(scenario.low95)} – {formatPrice(scenario.high95)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-zinc-500">
            {stability ? "Prob. of increase" : "Prob. of upside"}
          </dt>
          <dd className="tabular-nums text-zinc-300">
            {(scenario.probabilityUp * 100).toFixed(0)}%
          </dd>
        </div>
      </dl>

      <p className="mt-3 border-t border-zinc-800 pt-2 text-[11px] text-zinc-600">
        68% coverage: {coverageLabel(scenario.coverage68, 0.68)}
        {scenario.coverageSamples > 0 ? ` (${scenario.coverageSamples} windows)` : ""}
      </p>
      {current != null && scenario.low68 <= current && current <= scenario.high68 ? (
        <p className="mt-1 text-[11px] text-zinc-600">
          Current price is inside the projected range.
        </p>
      ) : null}
    </div>
  );
}

function LevelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="tabular-nums text-zinc-200">{value}</span>
    </div>
  );
}

/**
 * Pivots of the previous session, as forward-looking targets.
 *
 * Swing pivots are fitted to past price; these are fixed in advance from the last
 * completed period, which makes them usable as a target rather than a description.
 */
function PivotTargetsBlock({
  bars,
  price,
  enabled,
}: {
  bars: PivotSourceBar[];
  price: number | null;
  enabled: boolean;
}) {
  const table = useMemo(() => buildPivotTable(bars, "daily"), [bars]);
  const targets = useMemo(
    () => (table && price != null ? pivotTargets(table, price) : null),
    [table, price],
  );
  if (!enabled) return null;
  if (!table || !targets || (!targets.resistance && !targets.support)) return null;

  return (
    <div className="mt-4 border-t border-zinc-800 pt-3">
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] uppercase tracking-wide text-zinc-600">
          Pivot targets (previous session)
        </p>
        <InfoTooltip term="pivot_points" />
      </div>
      <div className="mt-2 space-y-1">
        {targets.resistance ? (
          <LevelRow
            label={`Upside target ${targets.resistance.level} (${targets.resistance.distancePct >= 0 ? "+" : ""}${targets.resistance.distancePct.toFixed(2)}%)`}
            value={formatPrice(targets.resistance.price)}
          />
        ) : null}
        {targets.support ? (
          <LevelRow
            label={`Support ${targets.support.level} (${targets.support.distancePct.toFixed(2)}%)`}
            value={formatPrice(targets.support.price)}
          />
        ) : null}
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        Average of Classic, Fibonacci, Camarilla, Woodie, and DeMark. The full
        table is on the Motor &amp; Technicals tab.
      </p>
    </div>
  );
}

function ForecastLevelsCard({
  forecast,
  bars,
}: {
  forecast: PriceForecast;
  bars: PivotSourceBar[];
}) {
  const { levels } = forecast;
  const hasLevels =
    levels.supports.length > 0 ||
    levels.resistances.length > 0 ||
    levels.bollingerMid != null;

  if (!hasLevels) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-black p-4">
        <h3 className="text-sm font-medium text-white">Technical levels</h3>
        <p className="mt-2 text-sm text-zinc-500">
          No confirmed pivots in the period — no support or resistance to report.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-black p-4">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-medium text-white">Technical levels</h3>
        <InfoTooltip term="support_resistance" />
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-zinc-600">Resistances</p>
          {levels.resistances.length > 0 ? (
            levels.resistances.map((r) => (
              <LevelRow key={r} label="Confirmed pivot" value={formatPrice(r)} />
            ))
          ) : (
            <p className="text-xs text-zinc-600">None above the current price.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-zinc-600">Supports</p>
          {levels.supports.length > 0 ? (
            levels.supports.map((s) => (
              <LevelRow key={s} label="Confirmed pivot" value={formatPrice(s)} />
            ))
          ) : (
            <p className="text-xs text-zinc-600">None below the current price.</p>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-1.5 border-t border-zinc-800 pt-3">
        {levels.bollingerUpper != null ? (
          <LevelRow label="Upper Bollinger band" value={formatPrice(levels.bollingerUpper)} />
        ) : null}
        {levels.bollingerMid != null ? (
          <LevelRow label="Band midpoint (MA20)" value={formatPrice(levels.bollingerMid)} />
        ) : null}
        {levels.bollingerLower != null ? (
          <LevelRow label="Lower Bollinger band" value={formatPrice(levels.bollingerLower)} />
        ) : null}
        {levels.atr != null ? (
          <LevelRow label="ATR(14) — average daily range" value={levels.atr.toFixed(2)} />
        ) : null}
        {levels.invalidation != null ? (
          <LevelRow label="Invalidation level" value={formatPrice(levels.invalidation)} />
        ) : null}
      </div>
      {levels.invalidationNote ? (
        <p className="mt-2 text-[11px] text-zinc-500">{levels.invalidationNote}</p>
      ) : null}

      {levels.fibonacci.length > 0 ? (
        <div className="mt-4 border-t border-zinc-800 pt-3">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] uppercase tracking-wide text-zinc-600">
              Fibonacci (confirmed swing)
            </p>
            <InfoTooltip term="fibonacci" />
          </div>
          <div className="mt-2 space-y-1">
            {levels.fibonacci.map((level) => (
              <LevelRow
                key={`${level.kind}-${level.ratio}`}
                label={`${level.kind === "retracement" ? "Retracement" : "Extension"} ${level.label}`}
                value={formatPrice(level.price)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <PivotTargetsBlock
        bars={bars}
        price={forecast.current}
        enabled={forecast.methodology !== "cash_stability"}
      />
    </section>
  );
}

function ForecastMethodCard({ forecast }: { forecast: PriceForecast }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-black p-4">
      <h3 className="text-sm font-medium text-white">How this projection is built</h3>
      <p className="mt-1 text-xs text-zinc-400">{forecast.methodologyLabel}</p>

      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-zinc-800/80 px-3 py-2">
          <dt className="text-[11px] text-zinc-600">Annualized volatility</dt>
          <dd className="text-sm tabular-nums text-zinc-200">
            {forecast.annualizedVolPct != null
              ? `${forecast.annualizedVolPct.toFixed(1)}%`
              : "—"}
          </dd>
        </div>
        <div className="rounded border border-zinc-800/80 px-3 py-2">
          <dt className="text-[11px] text-zinc-600">Daily drift</dt>
          <dd className="text-sm tabular-nums text-zinc-200">
            {(forecast.dailyDrift * 100).toFixed(3)}%
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] text-zinc-500">Drift source: {forecast.driftSource}.</p>

      {forecast.drivers.length > 0 ? (
        <div className="mt-3 border-t border-zinc-800 pt-3">
          <p className="text-[11px] uppercase tracking-wide text-zinc-600">
            What moves the range
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {forecast.drivers.map((d) => (
              <li key={d.id} className="flex flex-wrap justify-between gap-2">
                <span className="text-zinc-400">{d.label}</span>
                <span className="text-zinc-300">
                  <span className="tabular-nums">{d.value}</span>
                  <span className="ml-2 text-zinc-600">{d.effect}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="mt-3 space-y-1.5 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
        {forecast.explanations.map((line) => (
          <li key={line}>· {line}</li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-zinc-600">{forecast.disclaimer}</p>
    </section>
  );
}

export function PriceForecastPanel({
  forecast,
  bars,
}: {
  forecast: PriceForecast;
  bars: ChartBar[];
}) {
  const priceLines = useMemo<ChartPriceLine[]>(() => {
    const lines: ChartPriceLine[] = [];
    const twentyDay = forecast.scenarios.find((s) => s.horizon === "20d");
    if (twentyDay) {
      lines.push({ price: twentyDay.high68, title: "68% high (20d)", color: "#4ade80" });
      lines.push({ price: twentyDay.low68, title: "68% floor (20d)", color: "#f87171" });
    }
    if (forecast.levels.nearestResistance != null) {
      lines.push({
        price: forecast.levels.nearestResistance,
        title: "Resistance",
        color: "#a78bfa",
      });
    }
    if (forecast.levels.nearestSupport != null) {
      lines.push({
        price: forecast.levels.nearestSupport,
        title: "Support",
        color: "#a78bfa",
      });
    }
    return lines;
  }, [forecast]);

  if (forecast.scenarios.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <h3 className="text-sm font-medium text-white">Price projection</h3>
        <p className="mt-2 text-sm text-zinc-500">
          {forecast.explanations[0] ??
            "Not enough data to project a price range."}
        </p>
      </section>
    );
  }

  const stability = forecast.methodology === "cash_stability";

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-medium text-white">
                {stability ? "NAV stability range" : "Price projection"}
              </h3>
              <InfoTooltip term="forecast_range" />
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Current price {formatPrice(forecast.current)} · data through {forecast.asOf ?? "—"}
            </p>
          </div>
          {forecast.confidence != null ? (
            <div className="rounded border border-zinc-800 px-3 py-1.5 text-right">
              <p className="text-[11px] text-zinc-600">Projection confidence</p>
              <p className="text-lg font-medium tabular-nums text-zinc-200">
                {forecast.confidence.toFixed(1)}/10
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {forecast.scenarios.map((s) => (
            <ScenarioCard
              key={s.horizon}
              scenario={s}
              current={forecast.current}
              stability={stability}
            />
          ))}
        </div>
      </section>

      {bars.length >= 2 ? (
        <section className="space-y-2 rounded-lg border border-zinc-800 bg-black p-4">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-medium text-white">Price, range, and levels</h3>
            <InfoTooltip term="forecast_coverage" />
          </div>
          <SymbolPriceChart
            bars={bars}
            previousClose={forecast.current}
            priceLines={priceLines}
          />
          <p className="text-[10px] text-zinc-600">
            <span className="text-emerald-400">━</span> 68% high (20d) ·{" "}
            <span className="text-red-400">━</span> 68% floor (20d) ·{" "}
            <span className="text-violet-400">━</span> support / resistance
          </p>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <ForecastLevelsCard forecast={forecast} bars={bars} />
        <ForecastMethodCard forecast={forecast} />
      </div>
    </div>
  );
}

function pctVsCurrent(current: number | null, target: number | null): string | null {
  if (current == null || target == null || current <= 0) return null;
  const pctValue = ((target - current) / current) * 100;
  const sign = pctValue > 0 ? "+" : "";
  return `${sign}${pctValue.toFixed(2)}%`;
}

export function AnalystForecastCard({ quote }: { quote: YahooQuoteSummary }) {
  const price = quote.price;
  const hasTargets =
    quote.targetMeanPrice != null ||
    quote.targetHighPrice != null ||
    quote.targetLowPrice != null;

  if (!hasTargets && !quote.recommendationKey) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-black p-4 space-y-2">
        <h3 className="text-sm font-medium text-white">Analyst consensus</h3>
        <p className="text-sm text-zinc-500">
          No analyst coverage for this name (common for ETFs, ADRs, or private
          companies). The projection above is purely quantitative.
        </p>
      </section>
    );
  }

  const meanPct = pctVsCurrent(price, quote.targetMeanPrice);
  const highPct = pctVsCurrent(price, quote.targetHighPrice);
  const lowPct = pctVsCurrent(price, quote.targetLowPrice);

  return (
    <section className="space-y-4 rounded-lg border border-zinc-800 bg-black p-4">
      <div>
        <h3 className="text-sm font-medium text-white">Analyst consensus</h3>
        <p className="mt-1 text-[11px] text-zinc-600">
          External source (Yahoo), independent of the quantitative model above.
        </p>
      </div>
      {quote.targetMeanPrice != null ? (
        <div>
          <p className="text-2xl font-semibold text-white">
            {formatPrice(quote.targetMeanPrice)} {quote.currency ?? "USD"}
          </p>
          {meanPct ? <p className="text-sm text-emerald-400">{meanPct} vs current</p> : null}
        </div>
      ) : null}
      {quote.numberOfAnalystOpinions != null ? (
        <p className="text-xs text-zinc-500">
          Based on {quote.numberOfAnalystOpinions} analyst
          {quote.numberOfAnalystOpinions === 1 ? "" : "s"}.
        </p>
      ) : null}
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-[11px] text-zinc-500">High target</p>
          <p className="text-white">{formatPrice(quote.targetHighPrice)}</p>
          {highPct ? <p className="text-xs text-zinc-400">{highPct}</p> : null}
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Mean target</p>
          <p className="text-white">{formatPrice(quote.targetMeanPrice)}</p>
          {meanPct ? <p className="text-xs text-zinc-400">{meanPct}</p> : null}
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Low target</p>
          <p className="text-white">{formatPrice(quote.targetLowPrice)}</p>
          {lowPct ? <p className="text-xs text-zinc-400">{lowPct}</p> : null}
        </div>
      </div>
      {quote.recommendationKey ? (
        <p className="text-sm text-zinc-300">
          Consensus: <span className="capitalize text-white">{quote.recommendationKey}</span>
        </p>
      ) : null}
    </section>
  );
}
