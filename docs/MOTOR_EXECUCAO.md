# Instruções de Execução — Motor por Abas

## Etapa 1A (pronto — validação em produção)

**Markets** lê `dashboard-snapshot.json` no Vercel Blob. Motor Daily atualiza diário.

| Comando | Função |
|---------|--------|
| `npm run motor:test-fontes` | Smoke test: FRED, yfinance, EDGAR, World Bank, ECB |
| `npm run motor:fontes` | Ingest manifesto (`fontes_manifest.json`) |
| `npm run motor:export-catalog` | Catálogo TS → `motor/config/catalog_by_class.json` |
| `npm run motor:daily` | **1A completo:** fontes → macro 16 abas → top-90% liquidez → relatórios MVP → snapshot |
| `npm run motor:validate-abas` | Aceite fi_treasury + credito_alternativo + snapshot |
| `npm run motor:symbol -- --symbol X --class-id Y` | On-demand um ticker (★ watchlist) |
| `npm run motor:blob-upload` | Publica SQLite + snapshot no Blob |
| `npm run motor:verify-cloud-snapshot` | Valida snapshot no Blob |

**Critério de pronto 1A:** Motor Daily verde; snapshot com `classes` + `tickers`, `quality.ok`; Markets com scores para papéis líquidos.

Guia de teste: [ETAPA_1A_TESTE.md](ETAPA_1A_TESTE.md).

**Não é 1A (→ 1B):** gráfico histórico ao clicar linha; ranking global tab All.

---

## Etapa 1 — Gestão de fontes (base)

Ingestão + teste de conexão.

| Comando | Função |
|---------|--------|
| `npm run motor:test-fontes` | Smoke test por fonte |
| `npm run motor:fontes` | Ingest completo via manifesto |

**Critério:** `all_ok: true`; dados em SQLite (`raw_series`, `price_daily`, `yfinance_snapshot`, `edgar_metrics`).

---

## Etapas 2+ — Score por aba (manual)

| Etapa | Entrega | Critério |
|-------|---------|----------|
| 2 | Ingest por aba | Séries no SQLite |
| 3 | z-score + score composto | `S` coerente |
| 4 | `estagio.py` | Classificação + indicador dominante |
| 5 | `gerar_relatorio.py` | Pipeline → `.md` |
| 6 | Ticker só no config | Sem alterar código |
| 7 | Crédito Alt + EDGAR | BDC divergindo da categoria |

```bash
npm run motor:pipeline -- --aba fi_treasury
npm run motor:report -- --aba credito_alternativo
```

## Nuvem

- **App:** push `main` → Vercel (Git).
- **Motor:** GitHub Actions `motor-daily.yml` (06:00 UTC) ou Actions → Motor Daily → Run workflow.
- **On-demand ★:** `motor-symbol.yml` (requer `GITHUB_MOTOR_DISPATCH_TOKEN` na Vercel).

Ver: [schema-dados-abas.md](schema-dados-abas.md), [projeto-motor-decisao-alocacao.md](projeto-motor-decisao-alocacao.md), [classes-ativos-catalogo-claude.md](classes-ativos-catalogo-claude.md).
