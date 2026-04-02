# Validação — pipeline Python QI (`analytics/qi`)

Documento para diagnóstico: o que corre, dependências, Postgres, e **mapeamento de ficheiros** (nomes pedidos vs repositório).

## Mapeamento de caminhos (pedido → real)

| Prioridade | Pedido | Caminho no repo |
|------------|--------|-----------------|
| 1 | `analytics/qi/jobs/run_ingest_daily.py` | `analytics/qi/jobs/run_ingest_daily.py` |
| 1 | `analytics/qi/ingest/fred.py` | **`analytics/qi/ingest/fred_client.py`** (não existe `fred.py`; contrato alinhado ao TS `lib/market/fred.ts`) |
| 1 | `requirements.txt` / `pyproject.toml` | `analytics/requirements.txt` e `analytics/pyproject.toml` |
| 2 | Engine regime macro | `analytics/qi/engines/macro_regime.py` |
| 2 | Engine sector rotation | `analytics/qi/engines/sector_rotation.py` |
| 3 | Conexão Postgres | **`analytics/qi/db/session.py`** (`create_engine` + `get_session`). URL vem de **`analytics/qi/config.py`** (`DATABASE_URL`). |

**Código integral (verbatim):** [`QI_PYTHON_SOURCE_APPENDIX.md`](./QI_PYTHON_SOURCE_APPENDIX.md) — inclui também `qi/config.py` (env / `DATABASE_URL`), útil junto de `session.py`.

---

## O que executa (`run_ingest_daily.main`)

Ordem lógica (fase única ou `QI_INGEST_PHASE`):

1. **Opcional:** `seed_assets_if_empty` se FRED/Polygon/FMP forem corridos.
2. **FRED** (`ingest_fred`): lê `macro_series.json` **ou** universo “full” via árvore de categorias (`QI_FRED_UNIVERSE`, `discover_fred_series_catalog`). Upsert `QiMacroSeries` + pontos `QiMacroSeriesPoint` com `ON CONFLICT DO NOTHING`.
3. **Grelha Polygon:** só se cobertura FRED ≥ `QI_MIN_FRED_PCT` (default **100%**). Ingest OHLCV para `QiAsset` ativos (limite `QI_POLYGON_MAX_ASSETS`).
4. **FMP:** fundamentais TTM → `QiFundamentalSnapshot`.

Variáveis de ambiente relevantes: `DATABASE_URL`, `FRED_API_KEY`, `POLYGON_API_KEY`, `FMP_API_KEY`, `QI_FRED_BACKFILL_START`, `QI_INGEST_PHASE`, `QI_MIN_FRED_PCT`, `QI_FRED_UNIVERSE`, `QI_POLYGON_MAX_ASSETS`, etc.

---

## Dependências (Python)

- **requirements.txt / pyproject.toml:** SQLAlchemy 2.x, **psycopg v3** (`postgresql+psycopg://`), httpx, python-dotenv, numpy.
- **Python:** `>=3.11` (pyproject).

---

## Engines — comportamento resumido

### `macro_regime.run_macro_regime`

- Lê últimos valores FRED: `VIXCLS`, `NFCI`, `T10Y2Y`.
- Regras: `vix>22` → STRESS; `vix<15` e `nfci<0` → EASY; `nfci>0.5` → TIGHT_FINANCIAL; senão NEUTRAL.
- Persiste **`QiRegimeSnapshot`** `kind=MACRO` (não faz upsert; **adiciona** linha por execução — atenção a duplicados se o job correr várias vezes no mesmo dia sem limpeza).

### `sector_rotation.run_sector_rotation`

- Para cada setor GICS mapeado para ETF, calcula retorno ~63 dias vs **SPY**, usando **`QiMarketPriceDaily` com `source == POLYGON`**.
- Ordena por retorno relativo e grava **`QiSectorScoreSnapshot`** com `sector_code` = nome do setor (ex.: `"Technology"`), não o ticker.

**Integração com o stack Next.js (TS):** o ingest de preços em TypeScript usa **Yahoo / `YFINANCE`**. O engine Python de setores **só vê barras POLYGON**. Se só correr o cron TS de preços, **sector rotation Python pode não ter dados** até haver ingest Polygon ou alinhar a fonte.

---

## Postgres (`session.py` + `config.py`)

- `load_dotenv` em `analytics/.env.local` e `analytics/.env` (raiz do pacote `analytics`).
- `database_url()` exige `DATABASE_URL`; `session._engine_url` reescreve `postgresql://` → `postgresql+psycopg://` para o driver psycopg3.
- `get_session()` context manager: **commit** no sucesso, **rollback** em erro.

---

## Checklist de validação rápida

| Verificação | Passa se… |
|-------------|-----------|
| Ingest FRED | `FRED_API_KEY` + `DATABASE_URL`; pontos em `qi_macro_series_point` |
| Polygon após FRED | `QI_MIN_FRED_PCT` atingido ou `0`; `POLYGON_API_KEY`; assets seedados |
| Macro regime | Séries VIX/NFCI/T10Y2Y ingeridas; `qi_regime_snapshot` MACRO |
| Sector rotation (Python) | Preços **POLYGON** para SPY + ETFs setoriais; `qi_sector_score_snapshot` |
| Sem conflito TS/Python | Decidir fonte de preços (Polygon vs Yahoo) ou duplicar ingest |

---

## Referência cruzada (Next.js)

- Ingest FRED TS: `lib/qi/ingest-fred.ts`, cron `GET /api/cron/qi-macro`.
- Regime/setores TS: `lib/qi/regime-engine.ts`, `lib/qi/sector-rotation.ts`, crons `qi-*`.

Documento gerado para uso no Cursor / revisão offline sem depender do GitHub raw.
