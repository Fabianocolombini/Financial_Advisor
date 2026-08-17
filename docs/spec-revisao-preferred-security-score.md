# Spec: Revisão do Security Score — Classe Preferred Securities

**Status:** Fechado — `preferred_security_v2`
**Fase:** Etapa 1A (Preferred — sub-modelo Security Score)
**Depende de:** Regime Score de Preferred (spread / KRE / SLOOS — **sem alterações**)
**Última atualização:** 2026-08-17

---

## Decisões fechadas

| Ponto | Decisão |
|---|---|
| Yield trap (3.1) | **Haircut por z-score próprio:** `y_ajustado = y / (1 + max(z_252, 0))`, depois percentil na classe. Yield estruturalmente alto continua premiado; yield inflado por colapso recente não |
| Ingrediente de rating (3.2) | **Não agora.** Sleeve pontuado é ETF (PFF, PGX, …). EDGAR/FRED/yfinance não têm rating de preferred por emissor. Crédito (spread, bancos, SLOOS) fica no Regime Score |
| Trend + RSI | **Manter 30% + 20%** — mesma linha das outras classes |
| Vol | **Percentil invertido, aditivo, lookback 20d** — igual HY; 0.5 volta a ser o mediano |
| Sinal | `inverte_percentil: true` só em `vol_realizada` |
| Call price (3.4) | Fora desta rodada (e pouco aplicável a ETFs, não a $25 par) |

Score final:

```
0.30 × percentil(tendência)
+ 0.20 × percentil(RSI)
+ 0.25 × percentil(yield / (1 + max(z_252, 0)))
+ 0.25 × percentil(σ20)_invertido
```

Percentis 0–1 **dentro de Preferred, no mesmo dia**. Não comparável com outras classes.

## Ingredientes

| Ingrediente | Peso | Direção |
|---|---|---|
| Price trend (média MM50 e MM200) | 30% | percentil alto = mais acima das médias |
| RSI 14d | 20% | percentil alto = momentum mais forte |
| Dividend yield (anti-trap) | 25% | percentil alto = maior **carry ajustado**, não maior yield de distress |
| Volatilidade realizada 20d | 25% | percentil alto = **menor** σ20 vs pares |

`z_252` = z-score do yield vs a própria história (~1 ano). z ≤ 0 → haircut 1 (sem penalidade). z = 2 → yield entra no ranking com 1/3 do valor.

## Checagem de crédito (3.2)

| Fonte | O que há | Ranqueia preferred ETFs? |
|---|---|---|
| EDGAR | Métricas de fundo/NAV no motor, não rating de preferred | Não |
| FRED | SLOOS, DGS10 — já no Regime | Classe, não ticker |
| yfinance | Yield, preço — sem rating de emissão | Não |

## Fora de escopo

- Regime Score de Preferred
- Universo (setor, rating mínimo)
- Proximidade ao call price
- Cap numérico extra no percentil (o haircut de z já limita o extremo)
