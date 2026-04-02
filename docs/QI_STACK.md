# QI — decisão de stack (CLAUDE_2)

**Opção adoptada: B (híbrido)**

- **Jobs pesados e ingest alternativa:** `analytics/qi/` (Python) + [`/api/cron/qi-pipeline`](/app/api/cron/qi-pipeline/route.ts) com `QI_RUN_PYTHON=true` onde o host tiver Python.
- **Next.js / Vercel (sem Python):** ingest FRED TS ([`/api/cron/qi-macro`](/app/api/cron/qi-macro/route.ts)), preços Yahoo, motores em [`lib/qi/`](/lib/qi/) que gravam nas mesmas tabelas `qi_*`, e **APIs de leitura** [`/api/qi/*`](/app/api/) via Prisma.

Evita duplicar *duas* fontes de verdade para a mesma fórmula em produção: preferir **um** cron de regime/recomendação activo (TS *ou* Python), conforme ambiente.

**Legacy:** séries `MarketSeries` / `MarketObservation` mantêm-se para ingest antiga; novos fluxos QI usam `qi_*`. Não foi adicionado ETL automático Legacy→`qi_*` (opcional no plano).
