# Classes de Ativo, Indicadores e Fontes — Referência Definitiva

> Base: taxonomia oficial (`taxonomia-oficial-classes-ativos.md`). Especificação da **camada de ingestão** (Etapa 1). Score/z-score/estágio entram depois.

## Indicadores técnicos genéricos (qualquer papel negociável)

| Indicador | Fonte |
|-----------|-------|
| Preço vs. MM50 | yfinance |
| Preço vs. MM200 | yfinance |
| RSI 14d | yfinance |
| Volume vs. média | yfinance |
| Volatilidade realizada 20–60d | yfinance |

## Classes e indicadores

Ver manifesto executável: [`motor/config/fontes_manifest.json`](../../motor/config/fontes_manifest.json).

Resumo por classe — fontes gratuitas:

- **Cash Equivalents** — FRED `DTB3`, cálculos com `CPIAUCSL`, `DGS10`
- **FI Treasury** — FRED `T10Y2Y`, `T10Y3M`, `DFF`, yield real (`DGS10`−`T10YIE`)
- **FI IG** — FRED `BAMLC0A0CM`, spreads por rating, spread vs Treasury (cálculo)
- **FI HY** — FRED HY spreads, `DRALACBS`, HY−IG (cálculo)
- **FI TIPS** — FRED `T10YIE`, `T5YIE`, `DFII10`, `CPIAUCSL`
- **FI Preferred** — yfinance yield/par; FRED proxy crédito
- **US Equity** — yfinance P/E, dividend, ROE; FRED `VIXCLS`; CAPE multpl (Fase 2)
- **Intl / EM Equity** — yfinance P/E relativo; World Bank PIB; FRED FX
- **Real Estate** — yfinance preço; EDGAR FFO/AFFO; Nareit (Fase 2)
- **Commodities Precious** — FRED `DFII10`, `DTWEXBGS`, `CPIAUCSL`; yfinance `GLD`; COT (Fase 2)
- **Commodities Energy** — FRED `DCOILWTICO`, `DHHNGSP`
- **Energy MLP** — EDGAR coverage; FRED oil/gas
- **Health Care Biotech** — yfinance growth; EDGAR burn rate
- **Alternatives BDC** — EDGAR non-accrual/NAV; yfinance; FRED `BAMLH0A0HYM2`
- **Alternatives Infrastructure** — EDGAR coverage, dívida
- **Currencies** — FRED `DEXUSEU`, `DFF`; ECB API; COT (Fase 2)

## Dicionário de fontes

| Fonte | Custo | Etapa |
|-------|-------|-------|
| FRED | Grátis | 1 |
| yfinance | Grátis | 1 |
| SEC EDGAR | Grátis | 1 |
| Nareit | Grátis | 2 |
| World Bank API | Grátis | 2 |
| ECB SDW | Grátis | 2 |
| CFTC COT | Grátis (parsing) | 3 |
| multpl.com | Grátis (scraping) | 3 |

## Comandos Etapa 1

```bash
npm run motor:test-fontes    # smoke test cada fonte
npm run motor:fontes         # ingest completo do manifesto
```
