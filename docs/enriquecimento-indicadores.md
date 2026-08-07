# Enriquecimento de indicadores — Fase 2

Documento canónico para Tipo A/B/C, proxies e modelos estatísticos leves.
Implementação em `motor/config/fontes_manifest.json` + `motor/src/ingestao/external_jobs.py`.

## Categorias

| Tipo | Regra | Output |
|------|-------|--------|
| **A** | Cálculo direto ou ingest REST/scrape | Indicador normal |
| **B** | Proxy estatístico com correlação documentada | `is_proxy: true` + `proxy_rationale` |
| **C** | Sem proxy responsável | **Documentado apenas** — não implementar |

## Transparência (Tipo B)

No manifest, score (`componentes_json`) e snapshot (`isProxy`, `proxyRationale`):

```json
{
  "id": "hy_distress_proxy_score",
  "fonte": "calculado",
  "formula": "hy_distress_proxy_score",
  "is_proxy": true,
  "proxy_rationale": "Percentil 5y CCC OAS + percentil vol realizada HYG",
  "ingest_frequency": "daily"
}
```

## Tipo A — implementados

| Classe | ID | Fonte |
|--------|-----|-------|
| Treasuries | `real_yield_curve`, `fed_cut_probability`, `cot_net_position` | FRED + CME + CFTC |
| IG | `spread_by_rating` (AAA/AA/A/BBB) | FRED |
| TIPS | `breakeven_5y5y` | FRED T5YIFR |
| Preferred | `preferred_spread` | yfinance PFF + DGS10 |
| US Equity | `cape_shiller`, `put_call_ratio`, `aaii_sentiment`, `naaim_exposure`, `margin_debt` | Scrapers |
| International | `cape_by_country` | STAR Capital |
| EM | `embi_spread` | yfinance EMB + DGS10 |
| REITs | `nareit_yield_spread` | Nareit + FRED |
| Precious | `cb_gold_buying`, `etf_holdings`, `cot_gold_net` | WGC, sponsors, CFTC |
| Energy | `crude_oil_stocks`, `cot_crude_net` | FRED WCESTUS1, CFTC |
| MLP | `distribution_yield_spread` | yfinance AMLP + DGS10 (**substitui `price_amlp`**) |
| Biotech | `fda_calendar_density` | FDA.gov |
| BDC | `nav_premium_discount` | EDGAR NAV + yfinance |
| FX | `rate_differential` | FRED DFF + ECB |

## Tipo B — proxies

| ID | Racional resumido |
|----|-------------------|
| `earnings_revision_proxy` | PEAD 3d post-earnings (yfinance calendar) — não é revisão IBES |
| `hy_distress_proxy_score` | Percentil hy_ccc + vol HYG — não é distress ratio S&P |
| `bond_vol_proxy` | TLT IV CBOE ou vol realizada — não é MOVE |
| `reit_valuation_percentile` | Percentil 10y nareit_yield_spread — não é NAV por REIT |
| `risk_reversal_proxy` | Skew FXE ou vol realizada — não é OTC 25-delta |
| `private_funding_proxy` | Form D count biotech 90d — não é PitchBook |

## Tipo C — não implementar

| Indicador | Motivo |
|-----------|--------|
| HY default rate projetada | Sem série gratuita para calibrar |
| REIT cap rate por segmento | Requer appraisal |
| Preferred calendário primário | Sem agregador gratuito |
| Infra ROE regulatório | Fragmentado por estado |
| Cliffwater spread privado | Sem preço público |
| Fluxo institucional EPFR/Lipper | Máximo responsável = shares outstanding ETF |
| Rig count (Baker Hughes weekly) | Sem série FRED direta gratuita; WCESTUS1 é estoque cru |

## Modelos (camada 4)

| Modelo | Técnica | Snapshot `models` |
|--------|---------|-------------------|
| `regime_risk_probability` | Logit (auto-fit histórico FRED ou pesos ilustrativos) | `models.regime` + `calibrated` |
| Percentis valuation | `percentile_latest` em `zscore.py` | Nos componentes |
| EWMA vol | λ=0.94 SPY/TLT/HYG | `models.ewma_vol` |

## Jobs e frequência

| Job | Frequência | Fontes |
|-----|------------|--------|
| `motor-daily` | Diário | FRED, yfinance, CFTC, scrapers daily |
| `motor-external-weekly` | Semanal (opcional) | AAII, NAAIM, FDA, scrapers weekly |

Scrapers degradam gracefully — falha não quebra o daily.

## EIA vs FRED (Energy)

- **Estoque de petróleo cru weekly:** FRED `WCESTUS1` (= mesma série EIA WCESTUS1, sem API key).
- Cliente `eia_client`: **desabilitado por default**; só para séries extras (agregado petroleum `sndw`, gás/produtos) com `EIA_API_KEY`.
- **Rig count (Baker Hughes):** não está no FRED de forma direta; `WCESTUS1` **não** é sondas — foi corrigido. Rig count fica pendente (Tipo C / fonte Baker Hughes futura).

## Limitações

- Earnings proxy: **yfinance only** (sem FMP).
- Markets UI: **sem novas colunas** nesta fase (motor + snapshot + relatórios `.md`).
- CBOE/options delayed: fallback documentado em `proxy_rationale`.
