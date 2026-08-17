# Spec: Revisão do Security Score — Classe Precious Metals

**Status:** Fechado — `commodities_precious_security_v2`
**Fase:** Etapa 1A (Precious Metals — sub-modelo Security Score)
**Depende de:** Regime Score de Precious Metals (real yield / USD / CB buying / GLD holdings / COT crowding — **sem alterações**)
**Última atualização:** 2026-08-17

---

O v1 era `35% tendência + 25% RSI + 25% volume vs média + 15% expense invertido`. A lenda da UI já existia na chave certa (`commodities_precious`). Esta revisão fecha o volume em dólar, o sinal invertido do custo, e por que COT **não** entra no ranking diário.

## Decisões fechadas

| Ponto | Decisão |
|---|---|
| Expense ratio (3.1) | **Fica no score** (15%, invertido). É o único gap de qualidade entre veículos do mesmo metal (GLD vs IAU vs SGOL). Quase-estático, mas **diferencia nomes**. Filtro de catálogo (teto 50 bps) fica como curadoria futura — universo não reaberto aqui |
| Trend + RSI (3.2) | **Manter 35% + 25%** — mesma linha das classes de risco já fechadas (não reweight por redundância) |
| Positioning / COT (3.3) | **Não no Security Score.** `cot_gold_net` já é o pilar `crowding` do PreciousRegimeScore; holdings GLD já são o pilar `etf_holdings`. No mesmo dia o COT de ouro é o **mesmo** para GLD, IAU e SLV → `percentil(COT)` não muda o ranking. Mesma lição de OAS (HY/IG) e DGS10 (REITs) |
| Volume (3.4) | **Dólar** (`close × ações`) — GLD, IAU, SGOL e PSLV têm preço unitário muito diferente |
| 5º ingrediente (Proposta B) | **Fora** — padrão de 4 |
| Sinal | `inverte_percentil: true` só em `expense_ratio` |

Score final:

```
0.35 × percentil(tendência MM50/MM200)
+ 0.25 × percentil(RSI)
+ 0.25 × percentil(volume_dolar)
+ 0.15 × percentil(expense_ratio)_invertido
```

Percentis 0–1 **dentro de Precious Metals, no mesmo dia**. Não comparável com outras classes.

## Ingredientes

| Ingrediente | Peso | Direção |
|---|---|---|
| Price trend (média MM50 e MM200) | 35% | percentil alto = mais acima das médias |
| RSI 14d | 25% | percentil alto = momentum mais forte |
| Volume em dólar | 25% | percentil alto = maior `preço × ações` |
| Expense ratio | 15% | percentil alto = **menor** taxa |

## Por que COT não entra no ranking (Proposta A)

| Série | Onde já vive | Ranqueia GLD vs IAU? |
|---|---|---|
| `cot_gold_net` (CFTC, semanal) | PreciousRegimeScore `crowding` (w5) | Não — valor único no dia |
| `gld_holdings_tonnes` | PreciousRegimeScore `etf_holdings` (w4) | Não — fluxo de classe |

Copiar COT para o Security Score (Proposta A, 30%) faria todos os nomes subirem ou descerem juntos e **duplicaria** o Regime. Em Treasuries o COT está no Security justamente porque **não** está no Regime; aqui já está.

Expense ratio, ao contrário, é diferente por ticker: IAU mais barato que GLD continua a ganhar os 15% mesmo com tendência e RSI iguais.

## Fora de escopo

- Regime Score de Precious Metals
- Universo físico vs mineradoras (GDX/GDXJ)
- Holdings de ETF físico como 5º ingrediente (já no Regime)
- Proposta A (30/15/25/30 com COT) e Proposta B (5 ingredientes)
- Teto de 50 bps no catálogo
