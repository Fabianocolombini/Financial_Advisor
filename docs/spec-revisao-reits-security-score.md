# Spec: Revisão do Security Score — Classe REITs

**Status:** Fechado — `reits_security_v2`
**Fase:** Etapa 1A (REITs — sub-modelo Security Score)
**Depende de:** Regime Score de REITs (Nareit spread / yield real / valuation / refi — **sem alterações**)
**Última atualização:** 2026-08-17

---

O motor **já tinha** um v1 (`30% tendência + 25% yield bruto + 25% volume vs média − 20% σ`). Não estava documentado na UI: a receita vivia na chave `reits` e Markets agrupa a classe como `real_estate`. Esta revisão fecha a fórmula e a legenda.

## Decisões fechadas

| Ponto | Decisão |
|---|---|
| RSI | **Excluído** — igual Cash e ao v1. Trend sozinho cobre o lado equity; não nascer com a redundância Trend+RSI das outras classes |
| Yield vs DGS10 (3 / 4.1) | **Haircut anti-trap** (igual Preferred): `y_adj = y / (1 + max(z_252, 0))`, depois percentil. DGS10 é o **mesmo** para todos no dia → `percentil(y − DGS10) = percentil(y)`. O spread REIT vs Treasury 10y **já está no Regime** (`nareit_spread`) |
| Série de preço (4.2) | **Close do ETF** (`price_daily.close`). Não é total return; dividendos não são reinvestidos na série de tendência |
| Volume | **Dólar** (`close × ações`) — sleeve mistura VNQ e fundos menores |
| Vol | **Percentil invertido, aditivo, 20d** — não mais `− σ_pct` |
| Pesos | **30 / 35 / 20 / 15** (tendência / yield anti-trap / volume dólar / σ20) |
| Cap rate / P/FFO | Fora — Green Street é pago; fundamentais trimestrais ficam para due diligence |
| Sinal | `inverte_percentil: true` só em `vol_realizada` |

Score final:

```
0.30 × percentil(tendência MM50/MM200, close)
+ 0.35 × percentil(y / (1 + max(z_252, 0)))
+ 0.20 × percentil(volume_dolar)
+ 0.15 × percentil(σ20)_invertido
```

Percentis 0–1 **dentro de REITs, no mesmo dia**. Não comparável com outras classes.

## Ingredientes

| Ingrediente | Peso | Direção |
|---|---|---|
| Price trend (média MM50 e MM200, price return) | 30% | percentil alto = mais acima das médias |
| Dividend yield (anti-trap) | 35% | percentil alto = maior **carry ajustado**, não yield de distress |
| Volume em dólar | 20% | percentil alto = maior `preço × ações` |
| Volatilidade realizada 20d | 15% | percentil alto = **menor** σ20 vs pares |

## Por que DGS10 não entra no ranking

No mesmo dia, `DGS10` é um escalar de classe. Ordenar `y − DGS10` é ordenar `y`. O “REIT como alternativa ao Treasury 10y” é pergunta de **quanto alocar na classe** — já medida por `nareit_spread` no Regime Score. No Security Score o que diferencia VNQ de SCHH é o yield **do nome**, com haircut se o preço desabou.

`z_252` = z-score do yield vs a própria história (~1 ano). z ≤ 0 → haircut 1. z = 2 → o yield entra no ranking com 1/3 do valor.

## Série de preço (4.2)

| Hipótese | O que o código usa |
|---|---|
| Total return (dividendos reinvestidos) | **Não.** `price_daily.close` é o preço da cota |
| Yield no Trend | Isolado no pilar de 35% |

Um drift comum de distribuição sobe o NAV; o percentil no mesmo dia ainda compara quem se moveu mais.

## Fora de escopo

- Regime Score de REITs
- P/FFO, dívida/EBITDA, AFFO payout, NAV
- Cap rate por segmento (Green Street)
- Universo por subsetor
