# Schema JSON — configuração de abas

Cada aba = uma classe de ativo. Arquivo: `motor/config/abas/{id}.json`.

## Estrutura de pastas (`motor/`)

```
motor/
  config/
    abas/           # um JSON por classe
    fred_series.json
    indicadores_tecnicos.json
  src/
    ingestao/
    calculo/
    decisao/
    output/
    db/
  data/historico.db
  output/           # relatórios .md
```

## Schema da aba

```json
{
  "id": "fi_treasury",
  "nome": "Renda Fixa Soberana",
  "descricao": "Treasuries, T-bills, contexto de curva e Fed",
  "pesos_camada": {
    "macro": 0.50,
    "valuation": 0.35,
    "tecnico": 0.10,
    "fundamental": 0.05
  },
  "indicadores": [
    {
      "id": "spread_10y_2y",
      "nome": "Spread 10y-2y",
      "camada": "macro",
      "fonte": "fred",
      "serie": "T10Y2Y",
      "peso": 0.30,
      "zscore_window": 252,
      "direcao": "positiva"
    },
    {
      "id": "yield_real_10y",
      "nome": "Yield real 10y",
      "camada": "valuation",
      "fonte": "calculado",
      "formula": "DGS10 - T10YIE",
      "peso": 0.40,
      "zscore_window": 252,
      "direcao": "positiva"
    }
  ],
  "universo": [
    {
      "ticker": "TLT",
      "nome": "iShares 20+ Year Treasury",
      "benchmark": "AGG"
    }
  ],
  "estagio": {
    "regressao_dias": 90,
    "limiar_ascendente": 0.02,
    "limiar_descendente": -0.02
  }
}
```

### Campos de indicador

| Campo | Descrição |
|-------|-----------|
| `id` | Identificador único no aba |
| `camada` | `macro`, `valuation`, `tecnico`, `fundamental` |
| `fonte` | `fred`, `yfinance`, `calculado`, `edgar`, `external`, `ecb`, `world_bank` |
| `serie` | ID FRED (se `fonte=fred`) |
| `source` / `series_id` | Para `fonte=external` (tabela `external_series`) |
| `formula` | Expressão para `calculado` (ex. `DGS10 - T10YIE`) |
| `is_proxy` | `true` para Tipo B — obrigatório com `proxy_rationale` |
| `proxy_rationale` | Frase educacional explicando limitação do proxy |
| `ingest_frequency` | `daily`, `weekly`, `monthly` (jobs externos) |
| `ticker_field` | Campo yfinance: `pe`, `dividend_yield`, etc. |
| `edgar_metric` | `non_accrual_rate`, `nav` (BDC) |
| `peso` | Peso dentro da camada (normalizado no cálculo) |
| `zscore_window` | Janela em dias (default 252) |
| `direcao` | `positiva` (z alto = favorável) ou `negativa` |
| `inverte_percentil` | `true` se o percentil alto deve corresponder ao **menor** valor bruto (Cash: vol realizada e |ΔMA50| z-score) |

### Indicadores técnicos genéricos

Definidos em `config/indicadores_tecnicos.json`. Calculados para cada ticker em `universo` — não repetir no JSON da aba.

Cash usa `config/indicadores_tecnicos_cash.json` (sem RSI). Treasuries usa `config/indicadores_tecnicos_treasury.json` (tendência e RSI / duration, volume bruto, COT `inverte_percentil` + `cot_refresh: hold_last`). O SecurityScore ranqueia por percentil 0–1 na classe/dia; `inverte_percentil` deixa o sinal auditável.

## Exemplo Taxas (seção 2)

Ver [`motor/config/abas/fi_treasury.json`](../../motor/config/abas/fi_treasury.json).

## Exemplo Crédito Alternativo (seção 3)

Ver [`motor/config/abas/credito_alternativo.json`](../../motor/config/abas/credito_alternativo.json).

## Mapeamento 13 classes → arquivo

| Classe | Arquivo config |
|--------|----------------|
| Renda Fixa Soberana | `fi_treasury.json` |
| RF Corporativa IG | `bonds_corporativos.json` |
| Crédito Alt / HY | `credito_alternativo.json` |
| Dividendos | `dividendos.json` |
| Mercado Amplo | `mercado_amplo.json` |
| REITs | `reits.json` |
| Infraestrutura | `infraestrutura.json` |
| Commodities | `commodities.json` |
| TIPS / Inflação | `inflacao.json` |
| FX | `fx.json` |
| Caixa | `caixa.json` |
| Satélite Temático | `satelite_tematico.json` |
| Emergentes | `emergentes.json` |
