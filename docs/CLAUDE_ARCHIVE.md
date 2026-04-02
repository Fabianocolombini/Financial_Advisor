@AGENTS.md

# Financial Advisor — contexto completo do projeto (arquivo de referência abril/2026)

Cópia de trabalho alinhada ao documento externo `CLAUDE_2.md`. O guia canónico do repositório é **[CLAUDE.md](../CLAUDE.md)** (pode divergir após reconciliação).

Aplicação web para planejamento financeiro pessoal + motor quantitativo de portfólio.
Stack: **Next.js 16 (App Router)**, **React 19**, **TypeScript**, **Tailwind CSS 4**,
**PostgreSQL/Neon** via **Prisma 6**, **Auth.js v5** com Google OAuth,
**Python 3.11+** em `analytics/` para jobs quantitativos.

---

## ESTADO ATUAL DO PROJETO (diagnóstico abril/2026)

### O que está funcionando
- Ingestão **legacy** (`MarketSeries` / `MarketObservation`) via `lib/market/ingest.ts`
  — busca FRED + Yahoo, backfill incremental, upsert correto no Postgres
- Endpoint `/api/cron/ingest-market` protegido por `Authorization: Bearer CRON_SECRET`
- Schema Prisma com todos os modelos `qi_*` definidos e corretos
- Auth.js com Google OAuth funcional
- APIs REST de goals, balance, budget, transactions

### Gap crítico — dois mundos que não se falam
Existem **dois sistemas de ingestão paralelos** que precisam ser conectados:

```
LEGACY (funcionando)          QI (gerado, não validado)
─────────────────────         ──────────────────────────
MarketSeries                  QiMacroSeries
MarketObservation             QiMacroSeriesPoint
lib/market/fred.ts            analytics/ (Python)
lib/market/ingest.ts          lib/qi/ingest-fred.ts (?)
/api/cron/ingest-market       /api/cron/qi-* (?)
```

Os engines de regime e scoring dependem dos dados em `QiMacroSeries` —
mas a ingestão que funciona escreve em `MarketObservation`.
**Isso precisa ser resolvido antes de qualquer engine rodar.**

### Ordem de prioridade de execução
1. Validar migrações das tabelas `qi_*` no Neon
2. Validar endpoint cron legacy end-to-end
3. Construir bridge legacy → Qi OU criar ingestão Qi direta em TypeScript
4. Validar ingestão FRED nas séries do manifesto core
5. Construir Regime Engine sobre `QiMacroSeriesPoint`
6. Construir Sector Rotation Engine sobre `QiMarketPriceDaily`
7. Construir Asset Selection + Risk Filter
8. Construir Portfolio Optimizer
9. Expor resultados via API para o dashboard Next.js

---

(O restante do conteúdo original — variáveis, tabelas, regime engine, APIs, plano PASSO 1–9, convenções, Vercel — mantém-se igual ao ficheiro fonte `CLAUDE_2.md` usado na importação.)
