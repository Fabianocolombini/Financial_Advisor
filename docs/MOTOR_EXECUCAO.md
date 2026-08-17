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

**Preferred (`fi_preferred`) — modelos dedicados (v2):**
- Modelo 1 `PreferredRegimeScore` — spread proxy + DGS10 + Fed + Δ spread + KRE/SPY + SLOOS; bank-stress cap — **sem mudança nesta revisão**
- Modelo 2 `SecurityScore` v2 — tendência + RSI + yield anti-trap (`y/(1+max(z,0))`) + σ20 invertida; pesos 30/20/25/25. Sem volume. Rating por emissor não disponível nas fontes grátis (sleeve = ETFs)
- Config: `motor/config/models/preferred_regime.json`, `indicadores_tecnicos_preferred.json`
- Spec: `docs/spec-revisao-preferred-security-score.md`

**US Stocks (`us_equity`) — modelos dedicados (v2):**
- Modelo 1 `USEquityRegimeScore` — CAPE + earnings revision + put/call + AAII + NAAIM − margin debt; recession-warning cap — **sem mudança nesta revisão**
- Modelo 2 `SecurityScore` v2 — tendência + RSI + volume em dólar + σ20 invertida (20d); pesos 35/25/20/20. Sem P/E/ROE (fica 1B). Percentil no universo da aba, sem neutralização setorial/cap
- Config: `motor/config/models/us_equity_regime.json`, `indicadores_tecnicos_us_equity.json`
- Spec: `docs/spec-revisao-us-equity-security-score.md`

**International Stocks (`intl_equity`) — modelos dedicados (v2):**
- Modelo 1 `IntlEquityRegimeScore` — CAPE gap + USD fraco + OECD + rate diff — **sem mudança nesta revisão**
- Modelo 2 `SecurityScore` v2 — tendência + RSI + σ20 invertida + hedge fit vs UUP (distância ao alvo); pesos 30/20/20/30. Close USD do ETF (sem série local). Currency Exposure é bucket regional/cambial, igual Duration Fit
- Config: `motor/config/models/intl_equity_regime.json`, `indicadores_tecnicos_intl_equity.json`
- Spec: `docs/spec-revisao-intl-equity-security-score.md`

**Emerging Markets (`em_equity`) — modelos dedicados (v2):**
- Modelo 1 `EMEquityRegimeScore` — USD fraco + EMBI + commodities + China equity; DXY+VIX stress cap — **sem mudança nesta revisão**
- Modelo 2 `SecurityScore` v2 — tendência + RSI + volume em dólar + China fit vs FXI (distância ao alvo); pesos 30/20/20/30. Sem σ20 neste sleeve de ETFs amplos. Sem 5º ingrediente cambial (DXY já no Regime)
- Config: `motor/config/models/em_equity_regime.json`, `indicadores_tecnicos_em_equity.json`
- Spec: `docs/spec-revisao-em-equity-security-score.md`

**REITs (`reits` / UI `real_estate`) — modelos dedicados (v2):**
- Modelo 1 `REITsRegimeScore` — Nareit spread vs 10y + yield real + valuation + Δ spread + refi — **sem mudança nesta revisão**
- Modelo 2 `SecurityScore` v2 — tendência (close, não total return) + yield anti-trap + volume em dólar + σ20 invertida; pesos 30/35/20/15. Sem RSI. DGS10 não altera o ranking (constante no dia; spread vs Treasury fica no Regime)
- Config: `motor/config/models/reits_regime.json`, `indicadores_tecnicos_reits.json`
- Spec: `docs/spec-revisao-reits-security-score.md`

**Precious Metals (`commodities_precious`) — modelos dedicados (v2):**
- Modelo 1 `PreciousRegimeScore` — yield real baixo + USD fraco + compra de BCs + holdings GLD + crowding COT ouro — **sem mudança nesta revisão**
- Modelo 2 `SecurityScore` v2 — tendência + RSI + volume em dólar + expense invertida; pesos 35/25/25/15. COT ouro e holdings não entram no ranking (constantes no dia; já estão no Regime)
- Config: `motor/config/models/commodities_precious_regime.json`, `indicadores_tecnicos_commodities_precious.json`
- Spec: `docs/spec-revisao-precious-security-score.md`

**Energy (`commodities_energy`) — modelos dedicados (v2):**
- Modelo 1 `EnergyRegimeScore` — curva / estoques / rigs / WTI spot / COT crowding — **sem mudança nesta revisão**
- Modelo 2 `SecurityScore` v2 — tendência e RSI / \|β vs USO\| + volume em dólar + oil fit (distância ao alvo 0.70); pesos 35/20/20/25. Benchmark = USO (WTI), não Brent. Estoques/COT/rigs ficam no Regime
- Config: `motor/config/models/commodities_energy_regime.json`, `indicadores_tecnicos_commodities_energy.json`
- Spec: `docs/spec-revisao-energy-security-score.md`

**Energy MLP (`energy_mlp`) — modelos dedicados (v2):**
- Modelo 1 `MLPRegimeScore` — spread AMLP−10y + rates + vol AMLP — **sem mudança nesta revisão** (driver circular AMLP fora de escopo)
- Modelo 2 `SecurityScore` v2 — tendência (close, não total return) + yield anti-trap + volume em dólar + σ20 invertida; pesos 30/30/20/20. Sem RSI. Sem oil beta (sleeve midstream). Coverage DCF fica para 1B
- Config: `motor/config/models/energy_mlp_regime.json`, `indicadores_tecnicos_energy_mlp.json`
- Spec: `docs/spec-revisao-mlp-security-score.md`

**Alternative Credit / BDC (`credito_alternativo` / UI `alt_bdc`) — modelos dedicados (v2):**
- Modelo 1 `BDCRegimeScore` — SOFR + HY OAS + NAV/non-accrual de classe (proxy ARCC) — **sem mudança nesta revisão**
- Modelo 2 `SecurityScore` v2 — NAV discount invertido (preço_as_of / NAV hold-last) + non-accrual invertido + coverage NII/dividendos + tendência; pesos 30/30/25/15. Sem RSI, sem yield bruto, sem volume, sem σ. Hold-last trimestral em NA e coverage. NII = reportado (heurística 10-Q)
- Config: `motor/config/models/bdc_regime.json`, `indicadores_tecnicos_bdc.json`
- Spec: `docs/spec-revisao-bdc-security-score.md`

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
