# Spec: Revisão do Security Score — Classe TIPS

**Status:** Fechado — `tips_security_v2`
**Fase:** Etapa 1A (TIPS — sub-modelo Security Score)
**Depende de:** Regime Score de TIPS (sem alterações)
**Última atualização:** 2026-08-17

---

## Decisões fechadas

| Ponto | Decisão |
|---|---|
| Duration em Trend e RSI | **Sim** — mesma lógica de Treasuries/IG (`trend_bruto / duration` e RSI sobre `retorno / duration`) |
| Série de preço | **Close do ETF** (`price_daily.close` via yfinance). Não é dirty/clean price de TIPS individual. Sem deflacionar por CPI |
| Real-yield fit | **Confirmado:** fator de **faixa de duration** vs percentil de DFII10, não sinal do papel |
| Pesos | **Manter 30 / 20 / 15 / 35** (igual IG; sem reweight por redundância trend+RSI) |
| Crédito | **Fora** — TIPS são Tesouro americano |
| Sinal | `inverte_percentil` no schema; nenhum ingrediente inverte |
| Volume | **bruto** (`volume_negociado`) |

Score final:

```
0.30 × percentil(tendência / duration)
+ 0.20 × percentil(RSI(retorno_diário / duration))
+ 0.15 × percentil(volume_bruto)
+ 0.35 × (1 − |P(duration) − P(yield_real)|)
```

Percentis 0–1 **dentro de TIPS, no mesmo dia**. Não comparável com outras classes.

## Ingredientes

| Ingrediente | Peso | Direção |
|---|---|---|
| Price trend / duration (média MM50 e MM200) | 30% | percentil alto = mais acima das médias **por unidade de duration** |
| RSI 14d sobre retorno / duration | 20% | percentil alto = momentum mais forte **por unidade de duration** |
| Volume negociado (bruto) | 15% | percentil alto = **maior** volume |
| Real-yield fit vs DFII10 | 35% | fit alto = duration da faixa mais alinhada ao yield real do dia |

Real-Yield Fit **não** normaliza Trend/RSI — pergunta diferente (“essa faixa cabe no regime de yield real?”).

## Série de preço (3.2)

O motor pontua **ETFs** (TIP, SCHP, VTIP, STIP, LTPZ, SPIP), não o título TIPS no mercado primário.

| Hipótese do spec | O que o código usa |
|---|---|
| Clean price vs dirty (principal × index ratio) | Não aplicável — não há série de TIPS individual |
| Fonte | yfinance → `price_daily.close` = **preço de mercado da cota do fundo** |
| Inflação no NAV | O acréscimo de principal está dentro do NAV; o close acompanha o NAV (com ágio/deságio) |
| Deflacionar por CPI diário | **Não.** CPI é mensal; um deflator improvisado adiciona atraso sem recuperar clean price |

Um drift comum de CPI sobe o sleeve inteiro; o percentil **dentro da classe no mesmo dia** ainda compara quem se moveu mais. Duration em Trend/RSI trata o viés de convexidade (LTPZ vs VTIP).

## Fora de escopo

- Regime Score de TIPS
- Universo por vencimento
- Metodologia do yield real (`DFII10`)
- Ingrediente de crédito
