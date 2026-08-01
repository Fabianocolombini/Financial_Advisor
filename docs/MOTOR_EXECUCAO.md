# Instruções de Execução — Motor por Abas

## Etapa 1 (foco atual) — Gestão de fontes

Ingestão + teste de conexão. **Sem score/z-score/estágio.**

| Comando | Função |
|---------|--------|
| `npm run motor:test-fontes` | Smoke test: FRED, yfinance, EDGAR, World Bank, ECB |
| `npm run motor:fontes` | Ingest completo via `motor/config/fontes_manifest.json` |

**Critério de pronto:** `all_ok: true` nos testes; dados em SQLite (`raw_series`, `price_daily`, `yfinance_snapshot`, `edgar_metrics`).

Referência: [classes-ativos-indicadores-fontes.md](classes-ativos-indicadores-fontes.md), [taxonomia-oficial-classes-ativos.md](taxonomia-oficial-classes-ativos.md).

## Etapas 2+ — Score por aba

| Etapa | Entrega | Critério |
|-------|---------|----------|
| 2 | Ingest por aba | Séries no SQLite |
| 3 | z-score + score composto | `S` coerente |
| 4 | `estagio.py` | Classificação + indicador dominante |
| 5 | `gerar_relatorio.py` | Pipeline → `.md` |
| 6 | Ticker só no config | Sem alterar código |
| 7 | Crédito Alt + EDGAR | BDC divergindo da categoria |

```bash
npm run motor:pipeline -- --aba taxas
npm run motor:report -- --aba credito_alternativo
```

## MVP score (após Etapa 1)

1. Taxas + Crédito Alternativo ponta a ponta
2. Divergência papel vs categoria
3. Histórico em `scores_historico`
4. Novo ticker = mudança de config

## Fase 2/3 (manifesto)

Nareit, CFTC, multpl.com — desabilitados em `fontes_manifest.json`.

Ver: [schema-dados-abas.md](schema-dados-abas.md), [projeto-motor-decisao-alocacao.md](projeto-motor-decisao-alocacao.md).
