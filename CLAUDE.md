@AGENTS.md

# Financial Advisor — contexto completo do projeto

Aplicação web para planejamento financeiro pessoal + motor quantitativo de portfólio.
Stack: **Next.js 16 (App Router)**, **React 19**, **TypeScript**, **Tailwind CSS 4**,
**PostgreSQL/Neon** via **Prisma 6**, **Auth.js v5** com Google OAuth,
**Python 3.11+** em `analytics/` para jobs quantitativos.

Guia passo a passo (Neon, OAuth): **[docs/SETUP.md](docs/SETUP.md)**.  
Arquivo de referência importado: **[docs/CLAUDE_ARCHIVE.md](docs/CLAUDE_ARCHIVE.md)** (resumo; o canónico é este ficheiro).

---

## Estado real vs roadmap (reconciliação abril/2026)

| Tema | Estado no repo |
|------|----------------|
| Ingestão legacy | [`lib/market/ingest.ts`](lib/market/ingest.ts) → `MarketSeries` / `MarketObservation` |
| Ingestão QI FRED (TypeScript) | [`lib/qi/ingest-fred.ts`](lib/qi/ingest-fred.ts) + cron [`/api/cron/qi-macro`](app/api/cron/qi-macro/route.ts) → `QiMacroSeries` / `QiMacroSeriesPoint` |
| Ingestão QI (Python) | [`analytics/qi/jobs/run_ingest_daily.py`](analytics/qi/jobs/run_ingest_daily.py); opcional via [`/api/cron/qi-pipeline`](app/api/cron/qi-pipeline/route.ts) com `QI_RUN_PYTHON=true` |
| Manifesto macro (fonte única) | [`analytics/qi/data/macro_series.json`](analytics/qi/data/macro_series.json) — o ingest TS lê este ficheiro |
| IDs FRED GS vs DGS | Tabelas de referência abaixo citam `GS10`/`GS2` (mensais); o manifest atual usa sobretudo **`DGS10`/`DGS2`** (Treasury constant maturity diária). Equivalentes para curva; não misturar séries no mesmo cálculo sem alinhamento de frequência |
| Motores regime/scoring (Python) | Já existem em `analytics/qi/engines/`; variantes TS em `lib/qi/*` são roadmap |

**Produção:** evitar correr ingest TS e Python no mesmo minuto para as mesmas séries (duplica chamadas FRED); `@@unique([seriesId, observedOn])` evita duplicar pontos.

---

## ESTADO ATUAL DO PROJETO (diagnóstico)

### O que está funcionando
- Ingestão **legacy** (`MarketSeries` / `MarketObservation`) via [`lib/market/ingest.ts`](lib/market/ingest.ts)
- `/api/cron/ingest-market` com `Authorization: Bearer CRON_SECRET`
- Ingestão **QI FRED em TS**: `/api/cron/qi-macro` → `QiMacroSeries` / `QiMacroSeriesPoint`
- Schema Prisma com modelos `qi_*`
- Auth.js + APIs REST (goals, balance, budget, transactions)

### Gap — legacy vs QI
A ingestão legacy escreve em `MarketObservation`; os engines QI leem `qi_macro_*`. A ingestão TS/Python para `qi_*` reduz o gap; **bridge** Legacy→QI permanece roadmap opcional.

### Ordem de prioridade
1. Validar migrações `qi_*` (checklist abaixo)
2. Validar cron legacy (checklist abaixo)
3. ~~Ingestão QI FRED TS~~ (implementado) + validar dados no Neon
4. Regime / setores / recomendações conforme secções seguintes

---

## Checklist PASSO 1 — Migraciones / tabelas `qi_*`

```bash
npx prisma migrate dev
# ou produção:
npx prisma migrate deploy
```

- Confirmar no Neon (ou Prisma Studio) tabelas: `qi_macro_series`, `qi_macro_series_point`, `qi_ingestion_job`, etc.
- Se `migrate deploy` falhar com PgBouncer: connection string **directa** (não pooled) ou `directUrl` no Prisma — ver [docs/SETUP.md](docs/SETUP.md).

---

## Checklist PASSO 2 — Ingestão legacy end-to-end

```bash
curl -H "Authorization: Bearer SEU_CRON_SECRET" \
  http://localhost:3000/api/cron/ingest-market
```

- Resposta JSON com resumos por série; `FRED_API_KEY` e `CRON_SECRET` em `.env.local`.
- Verificar `MarketObservation` no Prisma Studio.

---

## Checklist PASSO 3 — Ingestão QI FRED (TypeScript)

```bash
curl -H "Authorization: Bearer SEU_CRON_SECRET" \
  http://localhost:3000/api/cron/qi-macro
```

- Lê [`analytics/qi/data/macro_series.json`](analytics/qi/data/macro_series.json).
- Regista `QiIngestionJob` (`source=FRED`, `jobName=macro_observations_ts`).
- Derivados tipo `yieldCurve` / `cpiYoy`: **roadmap** (PASSO 4 / regime engine); não bloqueiam o ingest de pontos.

---

## ARQUITETURA ALVO — FRED → REGIME → RECOMENDAÇÃO

```
FRED API
  └─► lib/qi/ingest-fred.ts ──► QiMacroSeries + QiMacroSeriesPoint
                                        │
                                        ▼
                              lib/qi/regime-engine.ts (roadmap)
                                        │
                                        ▼
                              QiRegimeSnapshot
                                        │
                     Sector Rotation / Asset / Optimizer / QiRecommendation
                                        │
                                        ▼
                    /api/qi/* → Dashboard
```

---

## VARIÁVEIS DE AMBIENTE

Copie [`.env.example`](.env.example) para `.env.local`:

| Variável | Obrigatório | Uso |
|----------|-------------|-----|
| `DATABASE_URL` | Sim | PostgreSQL Neon |
| `AUTH_SECRET` | Sim | Auth.js |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Login | OAuth |
| `AUTH_URL` | Produção recomendado | URL pública |
| `FRED_API_KEY` | Ingestão FRED | API FRED |
| `CRON_SECRET` | Crons | Bearer para `/api/cron/*` |
| `POLYGON_API_KEY` | QI preços | Opcional |
| `FMP_API_KEY` | Fundamentos | Opcional |
| `QI_MODEL_VERSION` | Engines | Ex.: `v0.1.0` |
| `QI_FRED_BACKFILL_START` | Opcional | Data inicial macro TS (default alinhado ao Python: `2019-01-01`) |

---

## BANCO E PRISMA

```bash
npx prisma migrate dev
npx prisma studio
npx prisma migrate deploy   # Vercel: ver npm run build:vercel
```

**Tabelas:** Legacy `MarketSeries`/`MarketObservation`; Auth; domínio (Goal, BalanceItem, …); **QI** — ver schema [`prisma/schema.prisma`](prisma/schema.prisma) (`QiMacroSeries`, `QiMarketPriceDaily`, `QiRegimeSnapshot`, …).

---

## SÉRIES FRED — MANIFESTO CORE (referência regime)

| Campo derivado | Série FRED | Notas |
|----------------|------------|--------|
| yields | `GS10`/`GS2` ou **`DGS10`/`DGS2`** | Frequências diferentes; manifest atual: **DGS*** |
| `yield_curve` | calculado | 10Y − 2Y na mesma família |
| `cpi_index` | `CPIAUCSL` | |
| … | (ver tabela completa no documento de arquivo) | |

---

## REGIME ENGINE — LÓGICA (roadmap)

Arquivo alvo: `lib/qi/regime-engine.ts`

```typescript
export function classifyMacroRegime(macro: MacroSnapshot): MacroRegime {
  if (macro.vix > 30 && macro.hyCreditSpread > 500) return "stress";
  if (macro.yieldCurve < 0 && macro.unemploymentRate > 0.045) return "recession";
  if (macro.cpiYoy > 0.035 && macro.fedFundsRising) return "inflation";
  return "expansion";
}
```

(Ver `CLAUDE_ARCHIVE` / especificação original para tabelas setoriais e restantes PASSOs 4–9.)

---

## APIs REST — MAPA

**Sessão obrigatória:** goals, balance-items, budget/*, transactions/* — ver tabela em versões anteriores; **sempre filtrar por `userId` da sessão.**

**QI (roadmap):** `GET /api/qi/regime`, `/api/qi/sectors`, `/api/qi/recommendation`, `/api/qi/portfolio`

**Cron (Bearer `CRON_SECRET`):**

| Rota | Descrição |
|------|-----------|
| `GET /api/cron/ingest-market` | Legacy FRED + Yahoo |
| `GET /api/cron/qi-macro` | QI `qi_macro_*` (TypeScript) |
| `GET /api/cron/qi-pipeline` | Python `QI_RUN_PYTHON=true` |

(Rotas `qi-prices`, `qi-regime`, … roadmap.)

---

## CONVENÇÕES

- Rotas UI: `/objetivos`, `/patrimonio`, `/orcamento`; textos **pt-BR**
- Lógica em `lib/`; UI em `components/`; `app/(dashboard)/`
- Decimal no banco; `lib/format.ts` para BRL na UI
- Rate limit: [`lib/rate-limit.ts`](lib/rate-limit.ts)
- Testes: `npm run test`; CI: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

## SEGURANÇA

- `/api/cron/*`: Bearer `CRON_SECRET`
- Nunca expor `FRED_API_KEY`, `CRON_SECRET`, `DATABASE_URL` no client
- HTTPS em produção; OAuth / LGPD

## DEPLOY — VERCEL

```bash
npm run build:vercel
```

Variáveis: `DATABASE_URL`, `AUTH_SECRET`, Google OAuth, `FRED_API_KEY`, `CRON_SECRET`.

Crons em [`vercel.json`](vercel.json) (ajustar horários conforme necessidade).
