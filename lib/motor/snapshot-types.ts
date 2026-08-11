/** Motor dashboard snapshot types (from motor/data/dashboard-snapshot.json). */

import type { YahooQuoteSummary } from "@/lib/market/yahoo-quote";
import type { TechnicalIndicatorRow } from "@/lib/market/technical-summary";
import type { PerfHorizons } from "@/lib/market/perf-horizons";
import type { SymbolFinancials } from "@/lib/market/financials-types";

export type MotorDominantIndicator = {
  id: string;
  name: string;
  contribution: number;
  value?: number | null;
};

export type MotorIndicatorSnapshot = {
  id: string;
  name: string;
  value: number | null;
  zScore?: number | null;
  contribution?: number | null;
  isProxy?: boolean;
  proxyRationale?: string;
};

export type MotorScoreHistoryPoint = {
  date: string;
  score: number;
};

export type MotorRegimeModelSnapshot = {
  regime_risk_probability: number;
  logit_z?: number;
  features?: Array<{ id: string; value: number; coefficient: number }>;
  calibrated?: boolean;
  calibration_warning?: string;
  calibrated_at?: string;
  n_samples?: number;
  label_note?: string;
  note?: string;
};

export type MotorEwmaVolSnapshot = Record<
  string,
  { ticker: string; ewma_vol_annualized: number; lambda: number }
>;

export type MotorModelsSnapshot = {
  regime?: MotorRegimeModelSnapshot;
  ewma_vol?: MotorEwmaVolSnapshot;
  cash_regime?: {
    cash_regime_score?: number;
    regime_action?: string;
    stress_flag?: boolean;
    calibrated?: boolean;
    calibration_note?: string;
    explanation?: string[];
  };
};

export type MotorClassRegimeModelSnapshot = {
  model?: string;
  score?: number;
  action?: string;
  actionCalculated?: string;
  stressFlag?: boolean;
  flightToQualityFlag?: boolean;
  inflationShockFlag?: boolean;
  creditEventFlag?: boolean;
  hyStressFlag?: boolean;
  tipsLiquidityFlag?: boolean;
  bankStressFlag?: boolean;
  recessionWarningFlag?: boolean;
  emStressFlag?: boolean;
  navStressFlag?: boolean;
  outputType?: "allocation" | "pace";
  sloosReferenceDate?: string;
  calibrated?: boolean;
  calibrationNote?: string;
  explanation?: string[];
  components?: Array<Record<string, unknown>>;
};

/**
 * Explicit decision fields exported by the motor so the app never has to infer
 * allocation, instrument quality or entry timing from a bare score.
 */
export type MotorDecisionExport = {
  scoreDomain?: "unit" | "signed";
  allocationAction?: string;
  instrumentQuality?: string;
  entryTiming?: string;
  entryReasons?: string[];
  peerMedian?: number;
};

export type MotorClassSnapshot = MotorDecisionExport & {
  abaId: string;
  classId: string;
  label: string;
  nome?: string;
  data: string;
  /** Persisted daily series, used for history and estágio. */
  score: number;
  /** Live regime-model score the allocation action was derived from. */
  allocationScore?: number;
  stage: string | null;
  stageLabel: string;
  entryValidated?: boolean;
  rationale?: string[];
  dominantIndicator?: MotorDominantIndicator | null;
  indicators: MotorIndicatorSnapshot[];
  allIndicators?: MotorIndicatorSnapshot[];
  scoreHistory?: MotorScoreHistoryPoint[];
  regimeModel?: MotorClassRegimeModelSnapshot;
};

export type MotorTickerSnapshot = MotorDecisionExport & {
  symbol: string;
  abaId: string;
  classId: string;
  data: string;
  score: number;
  stage: string | null;
  stageLabel: string;
  divergesFromClass?: boolean;
  entryValidated?: boolean;
  rationale?: string[];
  dominantIndicator?: MotorDominantIndicator | null;
  perf1dPct?: number | null;
  perf7dPct?: number | null;
  perf15dPct?: number | null;
  perf1mPct?: number | null;
  indicators: MotorIndicatorSnapshot[];
  allIndicators?: MotorIndicatorSnapshot[];
  scoreHistory?: MotorScoreHistoryPoint[];
};

export type MotorSnapshotQuality = {
  ok: boolean;
  stale?: boolean;
  expectedAsOf?: string;
  issues?: string[];
  warnings?: string[];
  classCount?: number;
  tickerCount?: number;
};

export type MotorDashboardSnapshot = {
  asOf: string | null;
  asOfConvention?: "previous_day_close";
  updatedAt?: string | null;
  quality?: MotorSnapshotQuality;
  models?: MotorModelsSnapshot;
  classes: Record<string, MotorClassSnapshot>;
  tickers: Record<string, MotorTickerSnapshot>;
};

export type WatchlistRow = {
  id: string;
  symbol: string;
  classId: string;
  name: string;
  exchange: string | null;
  kind: string | null;
  score: number | null;
  stageLabel: string;
  stage: string | null;
  divergesFromClass: boolean;
  entryValidated: boolean;
  /** Buy / Wait / Neutral / Avoid — richer than the boolean, absent on older snapshots. */
  entryTiming?: string | null;
  /** Preferred / Competitive / Weak — the instrument's band within its own class. */
  instrumentQuality?: string | null;
  dominantIndicator: MotorDominantIndicator | null;
  rationale: string[];
  perf1dPct: number | null;
  perf7dPct: number | null;
  perf15dPct: number | null;
  perf1mPct: number | null;
  /** Avg daily share volume (20 sessions), from Yahoo when not in snapshot. */
  avgVolumeShares: number | null;
  /** Share of class avg volume (0–100), for liquidity relevance within sleeve. */
  volumeSharePct: number | null;
  indicators: MotorIndicatorSnapshot[];
  hasMotorData: boolean;
  motorScope?: "ticker" | "class" | "none";
};

export type WatchlistClassGroup = {
  classId: string;
  label: string;
  classScore: number | null;
  classStageLabel: string | null;
  classEntryValidated: boolean | null;
  classDominantIndicator: MotorDominantIndicator | null;
  classIndicators: MotorIndicatorSnapshot[];
  rows: WatchlistRow[];
};

export type SymbolMotorContext = {
  classId: string;
  hasTickerMotor: boolean;
  hasClassMotor: boolean;
  motorScope: "ticker" | "class" | "none";
  ticker: MotorTickerSnapshot | null;
  classSnap: MotorClassSnapshot | null;
  score: number | null;
  classScore: number | null;
  stageLabel: string;
  classStageLabel: string;
  stage: string | null;
  entryValidated: boolean;
  classEntryValidated: boolean;
  divergesFromClass: boolean;
  dominantIndicator: MotorDominantIndicator | null;
  classDominantIndicator: MotorDominantIndicator | null;
  rationale: string[];
  classRationale: string[];
  /** Legacy merged list (top drivers) */
  indicators: MotorIndicatorSnapshot[];
  classIndicators: MotorIndicatorSnapshot[];
  tickerIndicators: MotorIndicatorSnapshot[];
  classScoreHistory: MotorScoreHistoryPoint[];
  tickerScoreHistory: MotorScoreHistoryPoint[];
  /** Explicit decision fields from the motor snapshot, when present. */
  decision: MotorDecisionExport;
  perf1dPct: number | null;
  perf7dPct: number | null;
  perf15dPct: number | null;
  perf1mPct: number | null;
};

export type DecisionReliabilitySummary = {
  score: number;
  meetsTarget: boolean;
  target: number;
  grade: "strong" | "adequate" | "weak" | "insufficient";
  summary: string;
  factors: Array<{
    id: string;
    label: string;
    score: number;
    max: number;
    note: string;
  }>;
};

export type SymbolDetailView = {
  symbol: string;
  name: string;
  classId: string;
  classLabel: string;
  exchange: string | null;
  kind: string | null;
  inWatchlist: boolean;
  snapshot: MotorDashboardSnapshot | null;
  motor: SymbolMotorContext;
  bars: Array<{
    date: string;
    value: number;
    volume?: number;
    high?: number;
    low?: number;
    adjClose?: number;
  }>;
  /** Distribuições (dividendos/juros) no período, usadas para leitura de total return. */
  distributions: Array<{ date: string; amount: number }>;
  perfHorizons: PerfHorizons;
  quote: YahooQuoteSummary;
  financials: SymbolFinancials;
  technicalRows: TechnicalIndicatorRow[];
  forecast: import("@/lib/market/forecast-model").PriceForecast;
  yahooWarning?: string;
  reliability: DecisionReliabilitySummary;
  dataEquation: import("@/lib/motor/class-data-equation").ClassDataEquation;
};
