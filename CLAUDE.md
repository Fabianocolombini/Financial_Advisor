@AGENTS.md

# Financial Advisor — contexto para IA (jul/2026)

Planejamento financeiro pessoal + **motor de decisão por abas** (`motor/`).
Estado consolidado: [ESTADO_DO_PROJETO.md](ESTADO_DO_PROJETO.md).

## Foco MVP

**Motor** = Python + SQLite + config JSON por classe de ativo. Fontes grátis: FRED, yfinance, EDGAR.
Output: relatórios `.md` com racional matemático explícito.

**QI legado** (`analytics/qi/`) = pausado; PostgreSQL, FMP/Polygon, regime GICS — referência apenas.

**Next.js** = CRUD pessoal mantido; `/mercado` bloqueado até motor validar 2 abas.

## Documentação motor

| Doc | Conteúdo |
|-----|----------|
| [docs/MOTOR_EXECUCAO.md](docs/MOTOR_EXECUCAO.md) | Etapas 1–7 e critérios de pronto |
| [docs/schema-dados-abas.md](docs/schema-dados-abas.md) | Schema JSON das abas |
| [docs/projeto-motor-decisao-alocacao.md](docs/projeto-motor-decisao-alocacao.md) | z-score, S, estágio, SQLite |
| [docs/tabela-classes-ativos-indicadores.md](docs/tabela-classes-ativos-indicadores.md) | 13 classes + fontes |
| [docs/classes-ativos-catalogo-claude.md](docs/classes-ativos-catalogo-claude.md) | **17 tabs UI, catálogo, motor, ranking 90d/90%, backlog** |
| [docs/guia-decisao-entrada-por-sleeve.md](docs/guia-decisao-entrada-por-sleeve.md) | Racional de entrada |

## Comandos motor

```bash
npm run motor:test-fontes   # Etapa 1: smoke test por fonte
npm run motor:fontes        # Etapa 1: ingest manifesto completo
npm run motor:test          # FRED smoke (legado)
npm run motor:pipeline      # Etapa 2+: score por aba
npm run motor:report        # relatório .md
```

Variáveis: `FRED_API_KEY` (`.env.local`), `MOTOR_ABA` (default `fi_treasury`).

## Entrega e deploy

- **Commit + push em `main`** após cada entrega de código (regra: `.cursor/rules/auto-commit-deploy.mdc`).
- **Vercel Production** deploya automaticamente em cada push em `main`.
- **Motor** (SQLite/snapshot no Blob): workflow `motor-daily.yml` (06:00 UTC) ou Actions → Motor Daily → Run workflow.

## Stack app (legado / mantido)

Next.js 16, React 19, Prisma 6, PostgreSQL/Neon, Auth.js v5.
Setup: [docs/SETUP.md](docs/SETUP.md).

## Convenções

- Textos UI pt-BR
- Motor: disclaimers educacionais nos relatórios
- Não usar FMP/Polygon no motor MVP
- Crons Vercel: `ingest-market`, `qi-macro` (legado)

## Arquivos-chave motor

| Área | Path |
|------|------|
| Pipeline | `motor/src/pipeline.py` |
| Config abas | `motor/config/abas/*.json` |
| FRED | `motor/src/ingestao/fred_client.py` |
| Cálculo | `motor/src/calculo/score_composto.py` |
| Estágio | `motor/src/decisao/estagio.py` |
| Relatório | `motor/src/output/gerar_relatorio.py` |
