# Spec: Revisão do Security Score — Classe Infrastructure

**Status:** Fechado — `alt_infrastructure_security_v2`
**Fase:** Etapa 1A (Infrastructure — sub-modelo Security Score)
**Depende de:** Regime Score de Infrastructure (`alt_infrastructure_regime_v1` — **sem alterações**)
**Última atualização:** 2026-08-17

---

O v1 era `35% tendência + 25% yield bruto + 20% vol inversa (`1 − σ_pct`) + 20% volume`. Sem RSI (já correto). Coverage, EV/EBITDA e Dívida/EBITDA já estavam mapeados na tabela da classe e **nunca entraram no score**. Esta revisão os incorpora e trata o yield trap.

## Decisões fechadas

| Ponto | Decisão |
|---|---|
| Versão | **V2 Completo** (recomendado). Não Mínimo, não Completo+Volume |
| RSI | **Continua fora** |
| Volume | **Fora** — espaço vai para os três fundamentais já identificados |
| Pesos | **20 / 15 / 20 / 20 / 15 / 10** (tendência / yield z / coverage / EV/EBITDA vs história / dívida/EBITDA / σ20) |
| Série de preço | **Close** (`price_daily.close`). Não é total return |
| Yield | z-score vs **história própria (3 anos / 756 sessões)**, depois percentil na classe. Não é yield bruto cross-sectional (heterogeneidade de subsetor). Coverage é a checagem estrutural do trap |
| EV/EBITDA | z vs história própria (até 12 trimestres), **invertido** (desconto vs o próprio múltiplo é melhor). Neutraliza utilities vs torres vs pedágios |
| Dívida/EBITDA | percentil **na classe**, invertido (menor alavancagem é melhor) — como o spec pede, não vs história |
| Coverage | FCF / dividendos (`OCF − \|capex\|` / `|dividendos|`) via SEC **companyfacts** (XBRL). Hold-last. Sem DCF de midstream |
| Lookback | **3 anos**, não 5. 5y inclui o regime de juro zero pré-2022 e distorce o EV/EBITDA “normal” de infra |
| Hold-last | Trimestral para coverage, EV/EBITDA e dívida/EBITDA (`data <= as_of`) |
| Vol | **Percentil invertido aditivo**, 20d — não mais `1 − σ_pct` |
| Universo | Sem reabrir. ETFs (IGF, IFRA, …) **não têm** 10-Q de emissor → 0.5 nos três pilares fundamentais. Issuers com `edgar_metric` (NEE, DUK, BIP, CCI, AMT, ENB) tentam companyfacts. BIP/ENB podem falhar (LP / Canadá) |
| Sinal | `inverte_percentil: true` em EV/EBITDA (z), Dívida/EBITDA e σ20 |
| Regime | **Sem mudança** (real yield / breakeven / infra gov / utilities z) |

Score final:

```
0.20 × percentil(tendência MM50/MM200, close)
+ 0.15 × percentil(z_3y do dividend yield)
+ 0.20 × percentil(FCF / dividendos)
+ 0.20 × percentil(z_3y de EV/EBITDA)_invertido
+ 0.15 × percentil(Dívida/EBITDA)_invertido
+ 0.10 × percentil(σ20)_invertido
```

Percentis 0–1 **dentro de Infrastructure, no mesmo dia**. Dado ausente no pilar fundamental → 0.5.

## Ingredientes

| Ingrediente | Peso | Direção |
|---|---|---|
| Price trend (média MM50 e MM200, price return) | 20% | percentil alto = mais acima das médias |
| Dividend yield (z vs própria história 3y) | 15% | percentil alto = yield mais acima da **própria** história, não vs torres/utilities |
| Distribution coverage (FCF / dividendos) | 20% | percentil alto = maior cobertura |
| EV/EBITDA vs história (z 12 trimestres) | 20% | percentil alto = **maior desconto** vs o próprio múltiplo |
| Dívida/EBITDA | 15% | percentil alto = **menor** alavancagem vs pares |
| Volatilidade realizada 20d | 10% | percentil alto = **menor** σ20 vs pares |

## Por que 6 ingredientes (exceção ao padrão de 4)

As outras classes fecharam em quatro pilares. Aqui os três fundamentais **já estavam identificados** na tabela da classe e o v1 os omitiu. Juntar coverage + valuation vs história + alavancagem é o conteúdo desta revisão, não um 5º ingrediente de liquidez. Volume fica de fora de propósito.

## Yield trap e heterogeneidade (3.1 / 3.3)

Ranquear yield **absoluto** na classe mistura subsetor (utilities pagam mais que torres) com qualidade. z vs história própria compara NEE com o NEE de 3 anos, não NEE com AMT. Coverage impede que um yield estourado por queda de preço ganhe sozinho: o pilar de 15% sobe, o de 20% cai se o FCF não cobre.

## Frequência

| Pilar | Congela | Move entre 10-Qs |
|---|---|---|
| Trend (20%) + yield z (15%) + σ20 (10%) | — | Close / yield diário |
| Coverage (20%) | FCF e dividendos XBRL | Hold-last |
| EV/EBITDA z (20%) | EBITDA, dívida, shares | Preço no EV pode ser o do filing; a série é trimestral |
| Dívida/EBITDA (15%) | Razão reportada | Hold-last |

~55% do score (coverage + EV z + dívida) fica trimestral. Comportamento esperado.

## Fonte

SEC companyfacts (`data.sec.gov/api/xbrl/companyfacts`) — um JSON por CIK com histórico, não heurística HTML de 10-Q (filings de utility são grandes demais para o parser de BDC). Preço e yield: yfinance.

## Fora de escopo

- Regime Score de Infrastructure
- Universo (utilities vs pedágios vs torres vs renováveis) — a heterogeneidade é tratada com “vs história própria”, não com abas novas
- Aba dedicada de Utilities
- Volume como 7º ingrediente
