# Taxonomia oficial — classes de ativo (referência de mercado)

Base: Callan / GICS / Morningstar. Alinhado a `classes-ativos-indicadores-fontes.md`.

## Hierarquia (13 blocos operacionais)

| ID | Classe | Config futuro |
|----|--------|---------------|
| `cash_equivalents` | Cash Equivalents | `caixa.json` |
| `fi_treasury` | Fixed Income → US Government/Treasury | `taxas.json` |
| `fi_ig` | Fixed Income → Investment Grade Corporate | `bonds_corporativos.json` |
| `fi_hy` | Fixed Income → High Yield Corporate | (parte crédito alt) |
| `fi_tips` | Fixed Income → TIPS | `inflacao.json` |
| `fi_preferred` | Fixed Income → Preferred Securities | `credito_alternativo.json` |
| `us_equity` | US Equity (Large/Mid/Small × Value/Blend/Growth) | `mercado_amplo.json`, `dividendos.json` |
| `intl_equity` | Developed ex-US Equity | `emergentes.json` (parcial) |
| `em_equity` | Emerging Market Equity | `emergentes.json` |
| `real_estate` | Real Estate (GICS, REITs) | `reits.json` |
| `commodities_precious` | Commodities → Precious Metals | `commodities.json` |
| `commodities_energy` | Commodities → Energy | `commodities.json` |
| `energy_mlp` | Energy (GICS) → MLP | `infraestrutura.json` |
| `healthcare_biotech` | Health Care → Biotechnology | `satelite_tematico.json` |
| `alt_bdc` | Alternatives → BDC | `credito_alternativo.json` |
| `alt_infrastructure` | Alternatives → Infrastructure | `infraestrutura.json` |
| `currencies` | Currencies (fator transversal) | `fx.json` |

## Etapa 1 (agora)

**Pipeline de gestão de fontes** — ingestão + teste de conexão. Sem score, z-score ou estágio.

Ordem: FRED → yfinance → EDGAR → (Nareit, World Bank, ECB) → (CFTC, multpl).

Manifesto canónico: [`motor/config/fontes_manifest.json`](../../motor/config/fontes_manifest.json).

## Etapa 2 (depois)

Tipos de ETF e papéis ad hoc por classe; conectar ao manifesto sem analisar um a um manualmente no código.
