# Spec: Revisão do Security Score — Classe IG Bonds

**Status:** Fechado — `ig_security_v2` (sem ingrediente de spread por ticker)
**Fase:** Etapa 1A (IG Bonds — sub-modelo Security Score)
**Depende de:** Regime Score de IG Bonds (OAS / Δ spread / BBB−AAA — **sem alterações**)
**Última atualização:** 2026-08-17

---

## Decisões fechadas

| Ponto | Decisão |
|---|---|
| Spread OAS no Security Score | **Não agora.** FRED (`BAMLC0A0CM`, AAA/AA/A/BBB) é índice de classe, não OAS por ETF. O mesmo número para todos os nomes não ranqueia LQD vs VCIT. Crédito permanece no Regime Score |
| Duration em Trend e RSI | **Sim** — mesma lógica de Treasuries (`trend_bruto / duration` e RSI sobre `retorno / duration`) |
| Pesos | **Manter 30 / 20 / 15 / 35** (Duration Fit continua o maior voto). Propostas A/B de redistribuição para spread ficam para quando houver dado por nome |
| Duration Fit | **Confirmado:** fator de **faixa de duration** (bucket macro), não sinal do emissor |
| Sinal | `inverte_percentil` no schema; nenhum ingrediente inverte hoje |
| Volume | **bruto** (`volume_negociado`) |

Score final:

```
0.30 × percentil(tendência / duration)
+ 0.20 × percentil(RSI(retorno_diário / duration))
+ 0.15 × percentil(volume_bruto)
+ 0.35 × (1 − |P(duration) − P(term_premium)|)
```

Percentis 0–1 **dentro de IG, no mesmo dia**. Não comparável com outras classes.

## Ingredientes

| Ingrediente | Peso | Direção |
|---|---|---|
| Price trend / duration (média MM50 e MM200) | 30% | percentil alto = mais acima das médias **por unidade de duration** |
| RSI 14d sobre retorno / duration | 20% | percentil alto = momentum mais forte **por unidade de duration** |
| Volume negociado (bruto) | 15% | percentil alto = **maior** volume |
| Duration fit vs term premium | 35% | fit alto = duration da faixa mais alinhada ao term premium do dia |

Duration Fit **não** normaliza Trend/RSI — pergunta diferente (“essa faixa de duration cabe no backdrop?”). Por isso os dois ajustes convivem: Trend/RSI / duration (viés de convexidade) **e** Duration Fit (alocação de faixa).

RSI é invariante à escala no instrumento; o viés de ponta longa é corrigido sobretudo no Price Trend.

## Checagem FRED (3.1)

| Série | O que é | Serve para ranquear ETFs? |
|---|---|---|
| `BAMLC0A0CM` | ICE BofA US Corporate OAS (classe) | Não — valor único no dia |
| `BAMLC0A1CAAA` … `BAMLC0A4CBBB` | OAS por rating de índice | Só se o universo for fatiado por rating; o sleeve atual (LQD, VCIT, AGG, BND) é IG amplo |

Melhoria futura: OAS (ou yield vs Treasury equivalente) **por ticker**. Sem essa série, Proposta A/B não entra.

## Fora de escopo

- Regime Score de IG (já contém `ig_oas`, Δ20d, BBB−AAA)
- Universo de instrumentos
- Metodologia do term premium (`THREEFYTP10`)
- Proposta A (20/15/15/25/25) e Proposta B (25/15/15/30/15)
