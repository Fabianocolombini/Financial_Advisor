@AGENTS.md

# Financial Advisor — contexto para IA (jul/2026)

Planejamento financeiro pessoal + **motor de decisão por abas** (`motor/`).
Estado consolidado: [ESTADO_DO_PROJETO.md](ESTADO_DO_PROJETO.md).

## Foco MVP

**Motor** = Python + SQLite + config JSON por classe de ativo. Fontes grátis: FRED, yfinance, EDGAR.
Output: relatórios `.md` com racional matemático explícito.

**QI legado** (`analytics/qi/`) = pausado; PostgreSQL, FMP/Polygon, regime GICS — referência apenas.

**Next.js** = CRUD pessoal + **Markets** (`/mercado`) via snapshot motor (Etapa 1A).

## Documentação motor

| Doc | Conteúdo |
|-----|----------|
| [docs/MOTOR_EXECUCAO.md](docs/MOTOR_EXECUCAO.md) | Etapas 1–7 e critérios de pronto |
| [docs/schema-dados-abas.md](docs/schema-dados-abas.md) | Schema JSON das abas |
| [docs/projeto-motor-decisao-alocacao.md](docs/projeto-motor-decisao-alocacao.md) | z-score, S, estágio, SQLite |
| [docs/tabela-classes-ativos-indicadores.md](docs/tabela-classes-ativos-indicadores.md) | 13 classes + fontes |
| [docs/classes-ativos-catalogo-claude.md](docs/classes-ativos-catalogo-claude.md) | **17 tabs UI, catálogo, motor, ranking 90d/90%, backlog** |
| [docs/enriquecimento-indicadores.md](docs/enriquecimento-indicadores.md) | Fase 2 Tipo A/B/C, proxies |
| [docs/COMANDO_CLAUDE_WEB_FASE2.md](docs/COMANDO_CLAUDE_WEB_FASE2.md) | **Claude Web: Motor Daily + External Weekly (browser)** |
| [docs/COMANDO_CLAUDE_WEB_RESEND.md](docs/COMANDO_CLAUDE_WEB_RESEND.md) | **Claude Web: Resend + Daily Digest email (browser)** |
| [docs/ETAPA_1A_TESTE.md](docs/ETAPA_1A_TESTE.md) | Checklist teste 1A em produção |
| [docs/guia-decisao-entrada-por-sleeve.md](docs/guia-decisao-entrada-por-sleeve.md) | Racional qualitativo de entrada (insumos de regime) |
| [docs/motor-timing-entrada-por-classe.md](docs/motor-timing-entrada-por-classe.md) | **Regra do motor `entryTiming` / Money, por classe** |

## Comandos motor

```bash
npm run motor:test-fontes   # Etapa 1: smoke test por fonte
npm run motor:fontes        # Etapa 1: ingest manifesto completo
npm run motor:export-catalog # Catálogo → catalog_by_class.json
npm run motor:daily         # 1A: fontes + macro + top-90% + snapshot
npm run motor:validate-abas # Aceite fi_treasury + credito_alternativo
npm run motor:pipeline      # Score uma aba (manual)
npm run motor:report        # relatório .md
npm run motor:symbol        # on-demand um ticker (--symbol / --class-id)
npm run motor:blob-upload   # snapshot + SQLite → Blob
```

Variáveis: `FRED_API_KEY` (`.env.local`), `BLOB_READ_WRITE_TOKEN` (Vercel + GH Actions).

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
