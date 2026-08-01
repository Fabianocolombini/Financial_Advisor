# Tabela Completa: Classes de Ativos, Indicadores e Fontes

Reconstrução por classe. Cada classe usa 4 camadas: **Macro/Ciclo**, **Valuation**, **Técnico/Momentum**, **Fundamental/Qualidade**.

## Indicadores técnicos genéricos (todas as classes negociáveis)

| Indicador | Fonte |
|-----------|-------|
| Preço vs MM50 | yfinance |
| Preço vs MM200 | yfinance |
| RSI 14d | yfinance |
| Volume vs média | yfinance |
| Força relativa vs benchmark | yfinance |
| Volatilidade realizada 20–60d | yfinance |

Definidos em `motor/config/indicadores_tecnicos.json`.

## Classes e indicadores principais

### 1. Renda Fixa Soberana → `taxas.json`
Macro: T10Y2Y, T10Y3M, DFF — FRED. Valuation: yield real (DGS10−T10YIE).

### 2. RF Corporativa IG → `bonds_corporativos.json`
Macro: BAMLC0A0CM. Valuation: spreads por rating (BAMLC0A1CAAA…BBB).

### 3. Crédito Alt / HY → `credito_alternativo.json`
Macro: BAMLH0A0HYM2, spreads BB/B/CCC, HY−IG. Fundamental: non-accrual BDC (EDGAR), NAV premium/desconto.

### 4. Dividendos → `dividendos.json`
Valuation: dividend yield z-score, P/E. Fundamental: payout, FCF coverage, dividend growth, ROE.

### 5. Mercado Amplo → `mercado_amplo.json`
Valuation: P/E índice. Macro: amplitude MM200. Sentimento: VIX (FRED).

### 6. REITs → `reits.json`
Valuation: P/FFO, cap rate vs DGS10. Fundamental: dívida/EBITDA, AFFO payout (EDGAR).

### 7. Infraestrutura → `infraestrutura.json`
Fundamental: coverage, EV/EBITDA, dívida/EBITDA (EDGAR). Macro: WTI, Henry Hub (FRED).

### 8. Commodities / Ouro → `commodities.json`
Valuation: DFII10, ouro deflacionado. Macro: DXY. Sentimento: COT (Fase 2).

### 9. TIPS / Inflação → `inflacao.json`
Valuation: T10YIE, T5YIE, DFII10. Macro: CPIAUCSL.

### 10. FX → `fx.json`
Técnico: DEXUSEU. Macro: Fed vs BCE. Sentimento: COT EUR (Fase 2).

### 11. Caixa → `caixa.json`
Valuation: DTB3, yield real caixa. Macro: spread DTB3 vs DGS10.

### 12. Satélite Temático → `satelite_tematico.json`
Fundamental: revenue growth, PEG, burn rate (EDGAR). Técnico: momentum vs índice temático.

### 13. Emergentes → `emergentes.json`
Valuation: P/E EEM vs SPY. Macro: PIB diferencial (World Bank, Fase 2).

## Fora do escopo MVP (Fase 2 enriquecimento)

CAPE/Shiller, Put/Call CBOE, revisões de luco (Refinitiv), NAV REIT (Green Street), CME FedWatch, COT parsing completo.

## Dicionário de fontes

| Fonte | Custo | Classes |
|-------|-------|---------|
| FRED | Grátis | 9+ |
| yfinance | Grátis | 11+ |
| SEC EDGAR | Grátis | 4 |
| CFTC COT | Grátis (parsing) | 2 |
| ECB / World Bank | Grátis | FX, EM |

Cripto: deliberadamente fora do framework.
