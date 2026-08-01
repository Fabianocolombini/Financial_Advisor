-- Motor SQLite schema

CREATE TABLE IF NOT EXISTS raw_series (
  data DATE NOT NULL,
  serie TEXT NOT NULL,
  valor REAL NOT NULL,
  PRIMARY KEY (data, serie)
);

CREATE TABLE IF NOT EXISTS price_daily (
  ticker TEXT NOT NULL,
  data DATE NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL NOT NULL,
  volume REAL,
  PRIMARY KEY (ticker, data)
);

CREATE TABLE IF NOT EXISTS edgar_metrics (
  ticker TEXT NOT NULL,
  data DATE NOT NULL,
  metric TEXT NOT NULL,
  valor REAL NOT NULL,
  PRIMARY KEY (ticker, data, metric)
);

CREATE TABLE IF NOT EXISTS indicadores_tecnicos (
  ticker TEXT NOT NULL,
  data DATE NOT NULL,
  indicador_id TEXT NOT NULL,
  valor REAL NOT NULL,
  PRIMARY KEY (ticker, data, indicador_id)
);

CREATE TABLE IF NOT EXISTS scores_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aba_id TEXT NOT NULL,
  data DATE NOT NULL,
  score_composto REAL NOT NULL,
  estagio TEXT,
  slope REAL,
  componentes_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(aba_id, data)
);

CREATE TABLE IF NOT EXISTS scores_ativo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aba_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  data DATE NOT NULL,
  score_composto REAL NOT NULL,
  estagio TEXT,
  diverge_categoria INTEGER DEFAULT 0,
  componentes_json TEXT NOT NULL,
  UNIQUE(aba_id, ticker, data)
);

CREATE TABLE IF NOT EXISTS yfinance_snapshot (
  ticker TEXT NOT NULL,
  data DATE NOT NULL,
  field TEXT NOT NULL,
  valor REAL,
  PRIMARY KEY (ticker, data, field)
);

CREATE TABLE IF NOT EXISTS world_bank_snapshot (
  indicator TEXT NOT NULL,
  country TEXT NOT NULL,
  data DATE NOT NULL,
  valor REAL,
  PRIMARY KEY (indicator, country, data)
);

CREATE TABLE IF NOT EXISTS source_status (
  fonte TEXT PRIMARY KEY,
  ok INTEGER NOT NULL,
  last_test_at TEXT NOT NULL,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS ingestion_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fonte TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  records INTEGER DEFAULT 0,
  detail TEXT
);
