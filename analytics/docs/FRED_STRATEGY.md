# FRED: legacy vs `qi_macro_series`

## Current state

- **Next.js ingest** ([`lib/market/ingest.ts`](../../lib/market/ingest.ts)) writes FRED observations into **`MarketSeries` / `MarketObservation`** with `MarketDataProvider.FRED`.
- **Python analytics** writes the same economic data into **`qi_macro_series` / `qi_macro_series_point`** (`QiMacroProvider.FRED`).

## Why two places (for now)

- Existing cron and Prisma code keep working without a breaking change.
- New quantitative jobs (macro regime, cross-asset analytics) read only from `qi_*` tables via SQLAlchemy.

## Migration path (optional)

1. Backfill `qi_macro_series` / `qi_macro_series_point` from `MarketSeries`/`MarketObservation` where `provider = 'FRED'` (map `externalId` → `external_id`, `observedAt` → `observed_on`).
2. Point [`lib/market/ingest.ts`](../../lib/market/ingest.ts) at `qi_*` via Prisma **or** stop TS FRED ingest and rely on Python only.
3. Deprecate `MarketSeries` rows with `provider = FRED` once consumers are switched.

## Env

- `FRED_API_KEY` — shared by TS and Python jobs.

## Python ingest (detalhe)

Ver [FRED_INGEST.md](./FRED_INGEST.md) — modos manifest/full, tabelas `qi_macro_*`, relatório exportável.
