# Financial Advisor — Estado do Projeto (jul/2026)

## Visão

Planejamento financeiro pessoal + **motor de decisão por abas** (classes de ativo).
Suporte educacional — não assessoria regulada.

## Duas linhas no repo

| Linha | Status | Path |
|-------|--------|------|
| **Motor por abas** (foco MVP) | Em construção | `motor/` |
| **QI legado** | Pausado / referência | `analytics/qi/` |
| **App Next.js** (CRUD pessoal) | Mantido, fora do MVP motor | `app/` |

## Motor (novo)

- Python + SQLite (`motor/data/historico.db`)
- **Etapa 1:** pipeline de fontes — `npm run motor:fontes`
- **Etapa 2+:** score por aba — `npm run motor:pipeline`
- Manifesto de ingestão: `motor/config/fontes_manifest.json`
- Config por aba (score): `motor/config/abas/*.json`

## QI legado (pausado)

- PostgreSQL/Prisma, 667 ativos, FMP/Polygon
- Sanity check (2026-05-25): cobertura 90d **14,87%** vs gate 80% → UI `/mercado` bloqueada
- Não deletar; usar como referência de ingestão

## Documentação canónica

- [docs/tabela-classes-ativos-indicadores.md](docs/tabela-classes-ativos-indicadores.md)
- [docs/schema-dados-abas.md](docs/schema-dados-abas.md)
- [docs/projeto-motor-decisao-alocacao.md](docs/projeto-motor-decisao-alocacao.md)
- [docs/guia-decisao-entrada-por-sleeve.md](docs/guia-decisao-entrada-por-sleeve.md)
- [docs/MOTOR_EXECUCAO.md](docs/MOTOR_EXECUCAO.md)

## Próximos passos

1. Validar aba Taxas ponta a ponta
2. Validar Crédito Alternativo + divergência BDC
3. Decidir bridge para Next.js `/mercado`
