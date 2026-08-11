"use client";

import { useMemo } from "react";
import type { YahooQuoteSummary } from "@/lib/market/yahoo-quote";
import { formatPrice } from "@/lib/format-market";
import type {
  ForecastScenario,
  PriceForecast,
} from "@/lib/market/forecast-model";
import type { ChartBar } from "@/lib/market/chart-overlays";
import { SymbolPriceChart, type ChartPriceLine } from "./SymbolPriceChart";
import { InfoTooltip } from "./InfoTooltip";

function pct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function coverageLabel(coverage: number | null, nominal: number): string {
  if (coverage == null) return "amostra insuficiente";
  const diff = coverage - nominal;
  const quality =
    Math.abs(diff) <= 0.05
      ? "bem calibrada"
      : diff > 0
        ? "conservadora (acertou mais que o nominal)"
        : "otimista (acertou menos que o nominal)";
  return `${(coverage * 100).toFixed(0)}% fora da amostra — ${quality}`;
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
        cenário central · {pct(scenario.centralChangePct)} vs atual
      </p>

      <dl className="mt-3 space-y-1.5 border-t border-zinc-800 pt-3 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-zinc-500">Faixa provável (68%)</dt>
          <dd className="tabular-nums text-zinc-200">
            {formatPrice(scenario.low68)} – {formatPrice(scenario.high68)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-zinc-500">Faixa ampla (95%)</dt>
          <dd className="tabular-nums text-zinc-400">
            {formatPrice(scenario.low95)} – {formatPrice(scenario.high95)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-zinc-500">
            {stability ? "Prob. de acréscimo" : "Prob. de alta"}
          </dt>
          <dd className="tabular-nums text-zinc-300">
            {(scenario.probabilityUp * 100).toFixed(0)}%
          </dd>
        </div>
      </dl>

      <p className="mt-3 border-t border-zinc-800 pt-2 text-[11px] text-zinc-600">
        Cobertura 68%: {coverageLabel(scenario.coverage68, 0.68)}
        {scenario.coverageSamples > 0 ? ` (${scenario.coverageSamples} janelas)` : ""}
      </p>
      {current != null && scenario.low68 <= current && current <= scenario.high68 ? (
        <p className="mt-1 text-[11px] text-zinc-600">
          O preço atual está dentro da faixa projetada.
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

function ForecastLevelsCard({ forecast }: { forecast: PriceForecast }) {
  const { levels } = forecast;
  const hasLevels =
    levels.supports.length > 0 ||
    levels.resistances.length > 0 ||
    levels.bollingerMid != null;

  if (!hasLevels) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-black p-4">
        <h3 className="text-sm font-medium text-white">Níveis técnicos</h3>
        <p className="mt-2 text-sm text-zinc-500">
          Sem pivôs confirmados no período — nenhum suporte ou resistência a reportar.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-black p-4">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-medium text-white">Níveis técnicos</h3>
        <InfoTooltip term="support_resistance" />
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-zinc-600">Resistências</p>
          {levels.resistances.length > 0 ? (
            levels.resistances.map((r) => (
              <LevelRow key={r} label="Pivô confirmado" value={formatPrice(r)} />
            ))
          ) : (
            <p className="text-xs text-zinc-600">Nenhuma acima do preço atual.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-zinc-600">Suportes</p>
          {levels.supports.length > 0 ? (
            levels.supports.map((s) => (
              <LevelRow key={s} label="Pivô confirmado" value={formatPrice(s)} />
            ))
          ) : (
            <p className="text-xs text-zinc-600">Nenhum abaixo do preço atual.</p>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-1.5 border-t border-zinc-800 pt-3">
        {levels.bollingerUpper != null ? (
          <LevelRow label="Banda de Bollinger superior" value={formatPrice(levels.bollingerUpper)} />
        ) : null}
        {levels.bollingerMid != null ? (
          <LevelRow label="Média da banda (MM20)" value={formatPrice(levels.bollingerMid)} />
        ) : null}
        {levels.bollingerLower != null ? (
          <LevelRow label="Banda de Bollinger inferior" value={formatPrice(levels.bollingerLower)} />
        ) : null}
        {levels.atr != null ? (
          <LevelRow label="ATR(14) — amplitude diária média" value={levels.atr.toFixed(2)} />
        ) : null}
        {levels.invalidation != null ? (
          <LevelRow label="Nível de invalidação" value={formatPrice(levels.invalidation)} />
        ) : null}
      </div>
      {levels.invalidationNote ? (
        <p className="mt-2 text-[11px] text-zinc-500">{levels.invalidationNote}</p>
      ) : null}

      {levels.fibonacci.length > 0 ? (
        <div className="mt-4 border-t border-zinc-800 pt-3">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] uppercase tracking-wide text-zinc-600">
              Fibonacci (swing confirmado)
            </p>
            <InfoTooltip term="fibonacci" />
          </div>
          <div className="mt-2 space-y-1">
            {levels.fibonacci.map((level) => (
              <LevelRow
                key={`${level.kind}-${level.ratio}`}
                label={`${level.kind === "retracement" ? "Retração" : "Extensão"} ${level.label}`}
                value={formatPrice(level.price)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ForecastMethodCard({ forecast }: { forecast: PriceForecast }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-black p-4">
      <h3 className="text-sm font-medium text-white">Como esta projeção é construída</h3>
      <p className="mt-1 text-xs text-zinc-400">{forecast.methodologyLabel}</p>

      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-zinc-800/80 px-3 py-2">
          <dt className="text-[11px] text-zinc-600">Volatilidade anualizada</dt>
          <dd className="text-sm tabular-nums text-zinc-200">
            {forecast.annualizedVolPct != null
              ? `${forecast.annualizedVolPct.toFixed(1)}%`
              : "—"}
          </dd>
        </div>
        <div className="rounded border border-zinc-800/80 px-3 py-2">
          <dt className="text-[11px] text-zinc-600">Deriva diária</dt>
          <dd className="text-sm tabular-nums text-zinc-200">
            {(forecast.dailyDrift * 100).toFixed(3)}%
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] text-zinc-500">Origem da deriva: {forecast.driftSource}.</p>

      {forecast.drivers.length > 0 ? (
        <div className="mt-3 border-t border-zinc-800 pt-3">
          <p className="text-[11px] uppercase tracking-wide text-zinc-600">
            O que move a faixa
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
      lines.push({ price: twentyDay.high68, title: "Topo 68% (20d)", color: "#4ade80" });
      lines.push({ price: twentyDay.low68, title: "Piso 68% (20d)", color: "#f87171" });
    }
    if (forecast.levels.nearestResistance != null) {
      lines.push({
        price: forecast.levels.nearestResistance,
        title: "Resistência",
        color: "#a78bfa",
      });
    }
    if (forecast.levels.nearestSupport != null) {
      lines.push({
        price: forecast.levels.nearestSupport,
        title: "Suporte",
        color: "#a78bfa",
      });
    }
    return lines;
  }, [forecast]);

  if (forecast.scenarios.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <h3 className="text-sm font-medium text-white">Projeção de preço</h3>
        <p className="mt-2 text-sm text-zinc-500">
          {forecast.explanations[0] ??
            "Dados insuficientes para projetar uma faixa de preço."}
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
                {stability ? "Faixa de estabilidade do NAV" : "Projeção de preço"}
              </h3>
              <InfoTooltip term="forecast_range" />
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Preço atual {formatPrice(forecast.current)} · dados até {forecast.asOf ?? "—"}
            </p>
          </div>
          {forecast.confidence != null ? (
            <div className="rounded border border-zinc-800 px-3 py-1.5 text-right">
              <p className="text-[11px] text-zinc-600">Confiança da projeção</p>
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
            <h3 className="text-sm font-medium text-white">Preço, faixa e níveis</h3>
            <InfoTooltip term="forecast_coverage" />
          </div>
          <SymbolPriceChart
            bars={bars}
            previousClose={forecast.current}
            priceLines={priceLines}
          />
          <p className="text-[10px] text-zinc-600">
            <span className="text-emerald-400">━</span> topo 68% (20d) ·{" "}
            <span className="text-red-400">━</span> piso 68% (20d) ·{" "}
            <span className="text-violet-400">━</span> suporte / resistência
          </p>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <ForecastLevelsCard forecast={forecast} />
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
        <h3 className="text-sm font-medium text-white">Consenso de analistas</h3>
        <p className="text-sm text-zinc-500">
          Sem cobertura de analistas para este papel (comum em ETFs, ADRs ou empresas
          privadas). A projeção acima é puramente quantitativa.
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
        <h3 className="text-sm font-medium text-white">Consenso de analistas</h3>
        <p className="mt-1 text-[11px] text-zinc-600">
          Fonte externa (Yahoo), independente do modelo quantitativo acima.
        </p>
      </div>
      {quote.targetMeanPrice != null ? (
        <div>
          <p className="text-2xl font-semibold text-white">
            {formatPrice(quote.targetMeanPrice)} {quote.currency ?? "USD"}
          </p>
          {meanPct ? <p className="text-sm text-emerald-400">{meanPct} vs atual</p> : null}
        </div>
      ) : null}
      {quote.numberOfAnalystOpinions != null ? (
        <p className="text-xs text-zinc-500">
          Baseado em {quote.numberOfAnalystOpinions} analista
          {quote.numberOfAnalystOpinions === 1 ? "" : "s"}.
        </p>
      ) : null}
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-[11px] text-zinc-500">Alvo máximo</p>
          <p className="text-white">{formatPrice(quote.targetHighPrice)}</p>
          {highPct ? <p className="text-xs text-zinc-400">{highPct}</p> : null}
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Alvo médio</p>
          <p className="text-white">{formatPrice(quote.targetMeanPrice)}</p>
          {meanPct ? <p className="text-xs text-zinc-400">{meanPct}</p> : null}
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Alvo mínimo</p>
          <p className="text-white">{formatPrice(quote.targetLowPrice)}</p>
          {lowPct ? <p className="text-xs text-zinc-400">{lowPct}</p> : null}
        </div>
      </div>
      {quote.recommendationKey ? (
        <p className="text-sm text-zinc-300">
          Consenso: <span className="capitalize text-white">{quote.recommendationKey}</span>
        </p>
      ) : null}
    </section>
  );
}
