# Spec: Revisão do Security Score — Classe International Stocks

**Status:** Fechado — `intl_equity_security_v2`
**Fase:** Etapa 1A (International Stocks — sub-modelo Security Score)
**Depende de:** Regime Score de International Stocks (CAPE gap / USD / OECD / rate diff — **sem alterações**)
**Última atualização:** 2026-08-17

---

## Decisões fechadas

| Ponto | Decisão |
|---|---|
| Série de preço (3.1) | **Close em USD do ETF** (`price_daily.close` via yfinance). Não migrar para moeda local — o sleeve pontuado (EFA, VEA, IEFA, VXUS, SCHF, VEU) é veículo listado nos EUA; não existe série “local” bem definida para um cesto EAFE/ex-US |
| Currency Exposure (3.2) | **Métrica de distância**, não de direção: `1 − \|P(\|β_UUP\|) − alvo\|`, `tipo_metrica: "distancia_ao_alvo"`. Mesmo padrão de Duration Fit (IG) e Real-Yield Fit (TIPS), não o \|z\| vs MA50 própria do Cash |
| Bucket (3.3) | **Confirmado:** fator de **mix regional/cambial do ETF**, aplicado no dia inteiro. Mesmo \|β\| vs UUP → mesmo fit, independente do nome |
| Trend + RSI (3.4) | **Manter 30% + 20%** — mesma linha das outras classes (não reweight) |
| Stability / vol | **Percentil invertido, aditivo, lookback 20d** — alinhado a HY / Preferred / US Stocks |
| Sinal | `inverte_percentil: true` só em `vol_realizada`. Currency Exposure não inverte: o fit já é “mais perto = melhor” |
| Fundamentalista | **Não agora** — mesma decisão de US Stocks (1B) |

Score final:

```
0.30 × percentil(tendência MM50/MM200)
+ 0.20 × percentil(RSI)
+ 0.20 × percentil(σ20)_invertido
+ 0.30 × (1 − |P(|β vs UUP|) − 0.35|)
```

Percentis 0–1 **dentro de International Stocks, no mesmo dia**. Não comparável com outras classes. Alvo de exposição = percentil 0.35 de \|beta\| vs UUP (ligeiramente abaixo da mediana do sleeve).

## Ingredientes

| Ingrediente | Peso | Direção |
|---|---|---|
| Price trend (média MM50 e MM200, close USD) | 30% | percentil alto = mais acima das médias |
| RSI 14d | 20% | percentil alto = momentum mais forte |
| Volatilidade realizada 20d | 20% | percentil alto = **menor** σ20 vs pares |
| Currency exposure (hedge fit vs UUP) | 30% | fit alto = \|β_USD\| mais perto do alvo da classe |

## Série de preço (3.1)

O motor pontua **ETFs internacionais listados em USD**, não a ação no mercado local.

| Hipótese do spec | O que o código usa |
|---|---|
| Preço em moeda local do papel | Não aplicável — não há listing local; EFA/VEA são cotas em USD |
| Fonte | yfinance → `price_daily.close` = **preço de mercado da cota** |
| Deflacionar por DXY / FX único | **Não.** EAFE é cesto (EUR, JPY, GBP, CHF, AUD…). Um FX único não isola “performance local” |
| Universo hedged (HEFA vs EFA) | Fora de escopo — universo não reaberto |

Um enfraquecimento amplo do dólar sobe o sleeve inteiro em USD; o percentil **dentro da classe no mesmo dia** ainda compara quem se moveu mais. A dimensão cambial explícita fica só em Currency Exposure (30%). Sobreposição residual nos técnicos é o custo de não ter série local — documentado, não “corrigido” com um deflator improvisado.

## Currency Exposure é bucket (3.3)

`P(\|β_UUP\|)` ordena os ETFs pela sensibilidade estrutural ao dólar (EAFE puro vs all-world ex-US vs tilt EM). O alvo 0.35 é **o mesmo para todos no dia**. Dois nomes com o mesmo \|beta\| recebem o mesmo fit — não é sinal do emissor. O regime (USD fraco, CAPE gap) continua em IntlEquityRegimeScore.

## Fora de escopo

- Regime Score de International Stocks (definição do alvo 0.35)
- Universo (ADRs vs locais, países)
- Neutralização por país/região (3.5)
- P/E / ROE — mesma decisão arquitetural de US Stocks
