/**
 * Manual end-to-end check: fetches real Yahoo history and prints the decision
 * summary and forecast for a few symbols. Not part of the automated suite.
 *
 * Usage: npx tsx scripts/verify-decision-forecast.ts SGOV BIL SHY SPY
 */

import { readFileSync } from "node:fs";
import { buildPriceForecast } from "../lib/market/forecast-model";
import { buildDecisionSummary, buildDecisionNarrative } from "../lib/motor/decision-summary";
import { fetchYahooChart } from "../lib/market/yahoo";
import { computeTechnicalSummary } from "../lib/market/technical-summary";
import { applicableTechnicalRows } from "../lib/market/indicator-applicability";
import type {
  MotorDashboardSnapshot,
  SymbolMotorContext,
} from "../lib/motor/snapshot-types";

const SNAPSHOT_PATH = "motor/data/dashboard-snapshot.json";

function loadSnapshot(): MotorDashboardSnapshot | null {
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8")) as MotorDashboardSnapshot;
  } catch {
    return null;
  }
}

function motorContext(
  symbol: string,
  snapshot: MotorDashboardSnapshot | null,
): { context: SymbolMotorContext; classId: string; classLabel: string } {
  const tick = snapshot?.tickers[symbol] ?? null;
  const classId = tick?.classId ?? "us_equity";
  const classSnap = snapshot?.classes[classId] ?? null;

  return {
    classId,
    classLabel: classSnap?.label ?? classId,
    context: {
      classId,
      hasTickerMotor: Boolean(tick),
      hasClassMotor: Boolean(classSnap),
      motorScope: tick ? "ticker" : classSnap ? "class" : "none",
      ticker: tick,
      classSnap,
      score: tick?.score ?? classSnap?.score ?? null,
      classScore: classSnap?.score ?? null,
      stageLabel: tick?.stageLabel ?? classSnap?.stageLabel ?? "Analyzing",
      classStageLabel: classSnap?.stageLabel ?? "Analyzing",
      stage: tick?.stage ?? null,
      entryValidated: tick?.entryValidated ?? false,
      classEntryValidated: classSnap?.entryValidated ?? false,
      divergesFromClass: tick?.divergesFromClass ?? false,
      dominantIndicator: tick?.dominantIndicator ?? null,
      classDominantIndicator: classSnap?.dominantIndicator ?? null,
      rationale: tick?.rationale ?? [],
      classRationale: classSnap?.rationale ?? [],
      indicators: [],
      classIndicators: classSnap?.allIndicators ?? [],
      tickerIndicators: tick?.allIndicators ?? [],
      classScoreHistory: [],
      tickerScoreHistory: [],
      decision: {
        scoreDomain: tick?.scoreDomain,
        allocationAction: classSnap?.allocationAction ?? tick?.allocationAction,
        instrumentQuality: tick?.instrumentQuality,
        entryTiming: tick?.entryTiming,
        entryReasons: tick?.entryReasons ?? [],
        peerMedian: tick?.peerMedian,
      },
      perf1dPct: null,
      perf7dPct: null,
      perf15dPct: null,
      perf1mPct: null,
    },
  };
}

async function run(symbol: string, snapshot: MotorDashboardSnapshot | null) {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 730 * 86400;
  const { bars, distributions } = await fetchYahooChart(symbol, period1, period2);

  const { context, classId, classLabel } = motorContext(symbol, snapshot);
  const price = bars[bars.length - 1]?.value ?? null;
  const technicalRows = computeTechnicalSummary(bars);
  const applicability = applicableTechnicalRows(technicalRows, classId);

  const decision = buildDecisionSummary({
    motor: context,
    classId,
    bars,
    price,
    technicalRows,
  });

  const forecast = buildPriceForecast({
    symbol,
    classId,
    bars,
    adjustedCloses: bars.map((b) => b.adjClose),
    motorScore: context.score,
    classIndicators: context.classIndicators,
    reliabilityScore: 9.1,
  });

  console.log(`\n${"=".repeat(72)}`);
  console.log(`${symbol}  (${classLabel} / ${classId})  price=${price?.toFixed(2)}`);
  console.log(`bars=${bars.length}  distributions=${distributions.length}`);
  console.log("-".repeat(72));
  console.log(`HEADLINE      : ${decision.headline}`);
  console.log(`allocation    : ${decision.allocation.stance} — ${decision.allocation.label}`);
  console.log(
    `instrument    : ${decision.instrument.quality} (score ${decision.instrument.score ?? "—"})`,
  );
  console.log(`entry         : ${decision.entry.timing} — ${decision.entry.label}`);
  console.log(`gauge subject : ${decision.gauge.subject} value=${decision.gauge.value}`);
  console.log(`bollinger     : ${decision.price.bollinger.label}`);
  console.log(`trend         : ${decision.price.trend.label}`);
  console.log(
    `indicators    : ${applicability.rows.length} aplicáveis, ${applicability.excluded.length} excluídos`,
  );
  console.log(`entryValidated: ${context.entryValidated}`);
  console.log("-".repeat(72));
  for (const s of buildDecisionNarrative(decision, {
    classLabel,
    symbol,
    entryValidated: context.entryValidated,
  })) {
    console.log(`# ${s.title}\n  ${s.body}`);
  }
  console.log("-".repeat(72));
  console.log(`forecast      : ${forecast.methodologyLabel}`);
  console.log(
    `vol anual     : ${forecast.annualizedVolPct?.toFixed(2)}%  drift/dia ${(forecast.dailyDrift * 100).toFixed(4)}%`,
  );
  console.log(`adjusted      : ${forecast.usedAdjustedSeries}  confiança ${forecast.confidence}`);
  for (const s of forecast.scenarios) {
    console.log(
      `  ${s.label.padEnd(20)} central ${s.central.toFixed(2)}  68% [${s.low68.toFixed(2)}, ${s.high68.toFixed(2)}]` +
        `  95% [${s.low95.toFixed(2)}, ${s.high95.toFixed(2)}]  cobertura68 ${
          s.coverage68 != null ? (s.coverage68 * 100).toFixed(0) + "%" : "n/d"
        } (${s.coverageSamples})`,
    );
  }
  console.log(
    `  suportes ${forecast.levels.supports.map((v) => v.toFixed(2)).join(", ") || "—"} | ` +
      `resistências ${forecast.levels.resistances.map((v) => v.toFixed(2)).join(", ") || "—"}`,
  );
  console.log(`  fibonacci: ${forecast.levels.fibonacci.length} níveis`);
}

async function main() {
  const symbols = process.argv.slice(2);
  const snapshot = loadSnapshot();
  for (const symbol of symbols.length ? symbols : ["SGOV", "BIL", "SHY", "SPY"]) {
    try {
      await run(symbol.toUpperCase(), snapshot);
    } catch (err) {
      console.error(`${symbol}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

void main();
