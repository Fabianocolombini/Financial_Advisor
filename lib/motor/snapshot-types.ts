/** Motor dashboard snapshot types (from motor/data/dashboard-snapshot.json). */

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
};

export type MotorClassSnapshot = {
  abaId: string;
  classId: string;
  label: string;
  nome?: string;
  data: string;
  score: number;
  stage: string | null;
  stageLabel: string;
  entryValidated?: boolean;
  rationale?: string[];
  dominantIndicator?: MotorDominantIndicator | null;
  indicators: MotorIndicatorSnapshot[];
};

export type MotorTickerSnapshot = {
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
  indicators: MotorIndicatorSnapshot[];
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
  dominantIndicator: MotorDominantIndicator | null;
  rationale: string[];
  indicators: MotorIndicatorSnapshot[];
  hasMotorData: boolean;
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
