# Spec: Revisão do Security Score — Classe High Yield

**Status:** Fechado — `hy_security_v2` (sem ingrediente de spread por ticker)
**Fase:** Etapa 1A (High Yield — sub-modelo Security Score)
**Depende de:** Regime Score de High Yield (OAS / Δ spread / quality / distress — **sem alterações**)
**Última atualização:** 2026-08-17

---

## Decisões fechadas

| Ponto | Decisão |
|---|---|
| Spread OAS no Security Score | **Não agora.** FRED BB/B/CCC (`BAMLH0A1HYBB`, `BAMLH0A2HYB`, `BAMLH0A3HYC`) diferencia **buckets de rating**, mas o universo pontuado (HYG, JNK, USHY, SJNK) é todo HY amplo — o mesmo backdrop para todos. Crédito permanece no Regime Score |
| Trend + RSI | **Manter 35% + 25%** — mesma linha de Treasuries/IG (não reweight por redundância) |
| Lookback de vol | **20 dias** (10 dias fica como decisão futura, igual Cash) |
| Vol no score | **Percentil invertido, aditivo** — não mais `− σ_pct`. Assim 0.5 continua o nome mediano |
| Sinal | `inverte_percentil: true` só em `vol_realizada` |
| Volume | **bruto** (`volume_negociado`) |
| Duration em Trend/RSI | **Fora desta revisão** (preço HY é mais crédito idiossincrático do que convexidade de taxa) |

Score final:

```
0.35 × percentil(tendência)
+ 0.25 × percentil(RSI)
+ 0.15 × percentil(volume_bruto)
+ 0.25 × percentil(σ20)_invertido
```

Percentis 0–1 **dentro de HY, no mesmo dia**. Risk-off que sobe a vol de todos não pune um ETF isolado. Não comparável com outras classes.

## Ingredientes

| Ingrediente | Peso | Direção |
|---|---|---|
| Price trend (média MM50 e MM200) | 35% | percentil alto = mais acima das médias |
| RSI 14d | 25% | percentil alto = momentum mais forte |
| Volume negociado (bruto) | 15% | percentil alto = **maior** volume |
| Volatilidade realizada 20d | 25% | percentil alto = **menor** σ20 vs pares |

Volatilidade é **sintoma** observável de stress de crédito, não o default em si. OAS, quality mix e distress proxy continuam no HYRegimeScore.

## Checagem FRED (3.1)

| Série | O que é | Ranqueia o sleeve atual? |
|---|---|---|
| `BAMLH0A0HYM2` | ICE BofA HY OAS (classe) | Não — valor único |
| `BAMLH0A1HYBB` / `BAMLH0A2HYB` / `BAMLH0A3HYC` | OAS por rating | Só se o universo incluir fatias (ex. HYBB). HYG/JNK/USHY/SJNK são HY amplo |

Melhoria futura: mapear ETFs a buckets de rating **quando** o universo pontuado tiver fatias (HYBB, fallen angels vs CCC-heavy). Sem isso, Proposta A/B não muda o ranking.

## Fora de escopo

- Regime Score de HY
- Universo de instrumentos
- Normalização por duration (Treasuries/IG)
- Proposta A (25/15/15/20/25) e Proposta B (30/20/15/20/15)
- Bid-ask no lugar de volume (viés de tamanho — observação, não bloqueador)
