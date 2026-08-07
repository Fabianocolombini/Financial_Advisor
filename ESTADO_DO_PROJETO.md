# Financial Advisor — Estado do Projeto (ago/2026)

## Visão

Planejamento financeiro pessoal + **motor de decisão por abas** (classes de ativo).
Suporte educacional — não assessoria regulada.

## Duas linhas no repo

| Linha | Status | Path |
|-------|--------|------|
| **Motor por abas** (foco MVP) | **Etapa 1A entregue** — teste em produção | `motor/` |
| **QI legado** | Pausado / referência | `analytics/qi/` |
| **App Next.js** (CRUD + Markets) | Mantido; `/mercado` com motor snapshot | `app/` |

## Motor — Fase 2 enriquecimento (em progresso)

- **Tipo A:** FRED extras, spreads calculados, CFTC, EDGAR NAV, scrapers (CME, Shiller, Nareit, etc.)
- **Tipo B:** 6 proxies com `is_proxy` + `proxy_rationale` no snapshot
- **Modelos:** logit regime + EWMA vol em `snapshot.models`
- **MLP:** driver `distribution_yield_spread` (substitui `price_amlp`)
- **UI Markets:** colunas atuais mantidas (charts → 1B)

Ver [docs/enriquecimento-indicadores.md](docs/enriquecimento-indicadores.md).

## Motor — Etapa 1A (entregue)

- Python + SQLite (`motor/data/historico.db`) → Vercel Blob
- **16 abas** em `motor/config/abas/*.json`
- **Motor Daily:** fontes → macro classe → **top-90% liquidez** por classe → snapshot
- **Markets:** watchlist + scores do Blob; fallback **class macro** se ticker sem score
- **On-demand ★:** workflow `motor-symbol` (opcional, via PAT GitHub)

### Comandos

```bash
npm run motor:daily           # pipeline 1A local
npm run motor:validate-abas   # aceite MVP
npm run motor:verify-cloud-snapshot
```

### Teste produção

[docs/ETAPA_1A_TESTE.md](docs/ETAPA_1A_TESTE.md)

## Próximo — Etapa 1B (não iniciar antes de 1A validada)

1. Gráficos ao clicar indicador (histórico `price_daily` / FRED)
2. `energy_mlp` aba motor dedicada (opcional)
3. Tab All com ranking global 90% (pesado)

## QI legado (pausado)

PostgreSQL/Prisma, FMP/Polygon — referência apenas. Crons `qi-macro` / dados Neon podem estar desatualizados.

## Documentação canónica

- [docs/MOTOR_EXECUCAO.md](docs/MOTOR_EXECUCAO.md)
- [docs/ETAPA_1A_TESTE.md](docs/ETAPA_1A_TESTE.md)
- [docs/classes-ativos-catalogo-claude.md](docs/classes-ativos-catalogo-claude.md)
- [docs/CLOUD_SETUP.md](docs/CLOUD_SETUP.md)
- [docs/CLOUD_VERIFICATION_CHECKLIST.md](docs/CLOUD_VERIFICATION_CHECKLIST.md)
