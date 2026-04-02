# Quantitative intelligence (Python)

Ingestion and analytics for `qi_*` PostgreSQL tables (see Prisma schema).

## Setup

```bash
cd analytics
python3 -m pip install -r requirements.txt
```

Ensure root `.env.local` defines `DATABASE_URL` (same as Next.js). Optional:

- `POLYGON_API_KEY` — daily OHLCV
- `FRED_API_KEY` — macro series in `qi_macro_series_point`
- `FMP_API_KEY` — fundamentals → `qi_fundamental_snapshot`
- `QI_MODEL_VERSION` — tag engine outputs (default `v0.1.0`)
- `QI_POLYGON_MAX_ASSETS` — throttle Polygon batch (default `40`)
- `QI_UNIVERSE_MAX_PER_SECTOR` — guard rail (default `120`)
- `QI_AS_OF_DATE` — `YYYY-MM-DD` for `run_analysis` only
- `QI_INGEST_PHASE` — `all` (default) | `fred` | `polygon` | `fmp` — roda só essa fase
- `QI_MIN_FRED_PCT` — `0`–`100` (default `100`): só ingere Polygon se a cobertura FRED for ≥ este %. Com `QI_FRED_UNIVERSE=full`, use `0` até o backfill avançar (senão o gate fica quase impossível).
- `QI_FRED_MANIFEST` — nome do ficheiro JSON em `analytics/qi/data/` (default `macro_series.json`). Produção = core; sandbox = `macro_series_sandbox.json` (ver [docs/FRED_MACRO_EXPANSION.md](docs/FRED_MACRO_EXPANSION.md))
- `QI_FRED_UNIVERSE` — `manifest` (default) = lista fixa do manifest | `full` = percorre a **árvore de categorias** FRED (séries deduplicadas); ver expansão controlada em [docs/FRED_MACRO_EXPANSION.md](docs/FRED_MACRO_EXPANSION.md)
- `QI_FRED_CATEGORY_ROOT` — ID da categoria raiz (default `0` = árvore completa). Subárvore: ver IDs em [fred.stlouisfed.org](https://fred.stlouisfed.org/)
- `QI_FRED_MAX_SERIES` — teto opcional na **descoberta** (ex. `20000`); sem isto, em `full` o primeiro run avisa que pode demorar muito
- `QI_FRED_DISCOVER` — `1` / `true` força nova descoberta (novas séries no catálogo FRED). Sem isto, com `full`, o job só atualiza séries **já** presentes em `qi_macro_series`
- `QI_FRED_REQUEST_DELAY_SEC` — pausa entre chamadas na descoberta e entre séries no ingest `full` (default `0.55` s — respeitar limite da chave FRED)
- `QI_FRED_BACKFILL_START` — data inicial das observações (default `2019-01-01`)

## Jobs

From repo root (with `PYTHONPATH`):

```bash
export PYTHONPATH="$(pwd)/analytics"
python3 -m qi.jobs.run_ingest_daily
python3 -m qi.jobs.run_universe_weekly
python3 -m qi.jobs.run_analysis
```

Documentação do ingest FRED (tabelas, env, SQL, **matriz de resultados possíveis** e checklist para decidir alargamento): [docs/FRED_INGEST.md](docs/FRED_INGEST.md). Relatório Markdown do que está na BD:

```bash
export PYTHONPATH="$(pwd)/analytics"
python3 -m qi.jobs.export_fred_catalog -o report/fred_catalog.md
```

Or from `analytics/`:

```bash
export PYTHONPATH="$PWD"
python3 -m qi.jobs.run_ingest_daily
```

## Migrations

Apply Prisma migrations so `qi_*` tables exist:

```bash
cd ..
npx prisma migrate deploy
```

## FRED dual-write

Legacy Next ingest still writes `MarketSeries` / `MarketObservation`. Python writes `qi_macro_*`. See [docs/FRED_STRATEGY.md](docs/FRED_STRATEGY.md).
