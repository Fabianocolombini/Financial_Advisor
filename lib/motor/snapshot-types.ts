/** Motor dashboard snapshot types (from motor/data/dashboard-snapshot.json). */

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
  indicators: MotorIndicatorSnapshot[];
};

export type MotorDashboardSnapshot = {
  asOf: string | null;
  asOfConvention?: "previous_day_close";
  updatedAt?: string | null;
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
  indicators: MotorIndicatorSnapshot[];
  hasMotorData: boolean;
};

export type WatchlistClassGroup = {
  classId: string;
  label: string;
  classScore: number | null;
  classStageLabel: string | null;
  classIndicators: MotorIndicatorSnapshot[];
  rows: WatchlistRow[];
};
