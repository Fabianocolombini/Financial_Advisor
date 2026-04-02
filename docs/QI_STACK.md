# QI — decisão de stack (CLAUDE_2)

**Opção adoptada: B (híbrido)**

- **Fonte de preços `qi_market_price_daily` (v0.2):** **Polygon** apenas — ingest Python [`run_ingest_daily`](../analytics/qi/jobs/run_ingest_daily.py) (`QI_INGEST_PHASE=polygon`). O cron TS Yahoo (`/api/cron/qi-prices`) foi removido.
- **Regime macro/risco, setores, recomendações:** escritos por **Python** (`run_analysis`). Crons TS que antes gravavam (`qi-regime`, `qi-sectors`, `qi-recommend`) ficam **desactivados por defeito** (`QI_ALLOW_TS_QI_WRITERS` não definido); APIs [`/api/qi/*`](../app/api/qi/) e páginas leem Prisma.
- **Jobs pesados:** `analytics/qi/` + [`/api/cron/qi-pipeline`](../app/api/cron/qi-pipeline/route.ts) com `QI_RUN_PYTHON=true` onde o host tiver Python.
- **Next.js / Vercel (sem Python):** ingest FRED TS opcional ([`/api/cron/qi-macro`](../app/api/cron/qi-macro/route.ts)); motores TS em [`lib/qi/`](../lib/qi/) existem como legado / override explícito.

**Legacy:** séries `MarketSeries` / `MarketObservation` mantêm-se para ingest antiga; novos fluxos QI usam `qi_*`. Não foi adicionado ETL automático Legacy→`qi_*` (opcional no plano).
