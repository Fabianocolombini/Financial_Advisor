# Instruções de Execução — Motor por Abas

## Fase 2 — Enriquecimento (dados gratuitos + proxies)

| Comando | Função |
|---------|--------|
| `npm run motor:fontes` | FRED + yfinance + **external_jobs** (CFTC, scrapers) |
| `npm run motor:test-fontes` | Smoke incl. CFTC quando habilitado |

Detalhe: [enriquecimento-indicadores.md](enriquecimento-indicadores.md).  
Operações manuais (browser): [COMANDO_CLAUDE_WEB_FASE2.md](COMANDO_CLAUDE_WEB_FASE2.md).

Snapshot passa a incluir `isProxy` / `proxyRationale` em indicadores e bloco `models` (regime + EWMA).

---

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

**Não é 1A (→ 1B):** ranking global tab All; gráfico ao clicar indicador individual.

---

## Etapa 1B (em progresso)

**Detalhe do papel:** `/mercado/[symbol]` — clique na linha da watchlist.

| Aba | Conteúdo |
|-----|----------|
| Overview | Chart 2Y, perf tiles, **equação de dados**, auditoria 0–10 (target ≥8) |
| **Motor** | Sleeve macro **completo** + security + **models** (regime/EWMA) + **score history** + FRED chart do driver |
| Financials | Yahoo fundamentals + earnings |
| Technicals | Todos indicadores class + ticker; TA genérica separada |
| Forecast | Motor + analyst Yahoo + tracker note |

APIs: `/api/market/[symbol]/chart|quote`, `/api/market/fred/[seriesId]`.

Snapshot export: `allIndicators`, `scoreHistory`, `decisionMap` (após Motor Daily).

**Cash (`cash_equivalents`) — modelos dedicados:**
- Modelo 1 `CashRegimeScore` → Overweight/Hold/Reduce/Strong Reduce (`calibrated: false`)
- Modelo 2 `SecurityScore` v3 — sem RSI; 50% volume bruto + 35% σ20 + 15% |ΔMA50| z-score `(preço−MA50)/σ50`
- Config: `motor/config/models/cash_regime.json`, `indicadores_tecnicos_cash.json`

**Treasuries (`fi_treasury`) — modelos dedicados (v2):**
- Modelo 1 `TreasuryRegimeScore` — term premium + Fed bonus − bond vol; stress dual (quality vs inflation 2022) — **sem mudança nesta revisão**
- Modelo 2 `SecurityScore` v2 — tendência e RSI / duration + volume bruto + COT hold-last invertido; pesos 35/25/20/20
- Config: `motor/config/models/treasury_regime.json`, `indicadores_tecnicos_treasury.json`, `treasury_duration_map.json`
- Spec: `docs/spec-revisao-treasury-security-score.md`; term premium FRED `THREEFYTP10` (ACM não na API FRED)

**IG Bonds (`fi_ig`) — modelos dedicados (v2):**
- Modelo 1 `IGRegimeScore` — OAS + term premium + Fed + Δ spread 20d + BBB−AAA; credit-event cap — **sem mudança nesta revisão**
- Modelo 2 `SecurityScore` v2 — tendência e RSI / duration + volume bruto + duration fit (bucket vs term premium); pesos 30/20/15/35. OAS por ETF não existe nas fontes grátis (FRED é índice de classe)
- Config: `motor/config/models/ig_regime.json`, `indicadores_tecnicos_ig.json`, `ig_duration_map.json`
- Spec: `docs/spec-revisao-ig-security-score.md`

**High Yield (`fi_hy`) — modelos dedicados (v2):**
- Modelo 1 `HYRegimeScore` — OAS + Δ spread 20d + quality (CCC/HY) + distress proxy; stress cap — **sem mudança nesta revisão**
- Modelo 2 `SecurityScore` v2 — tendência + RSI + volume bruto + σ20 invertida (20d); pesos 35/25/15/25. OAS por rating (BB/B/CCC) não ranqueia o sleeve atual (HY amplo)
- Config: `motor/config/models/hy_regime.json`, `indicadores_tecnicos_hy.json`
- Spec: `docs/spec-revisao-hy-security-score.md`

**TIPS (`fi_tips`) — modelos dedicados (v2):**
- Modelo 1 `TIPSRegimeScore` — yield real + breakeven 5y5y + CPI gap + Fed; liquidity cap — **sem mudança nesta revisão**
- Modelo 2 `SecurityScore` v2 — tendência e RSI / duration + volume bruto + real-yield fit (bucket vs DFII10); pesos 30/20/15/35. Preço = close do ETF (não dirty price de TIPS)
- Config: `motor/config/models/tips_regime.json`, `indicadores_tecnicos_tips.json`, `tips_duration_map.json`
- Spec: `docs/spec-revisao-tips-security-score.md`

**Backlog 1B:** click em cada indicador → mini-chart; sparklines no snapshot para external-only series.

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
