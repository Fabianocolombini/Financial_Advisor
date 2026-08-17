# Spec: Revisão do Security Score — Classe Energy MLP

**Status:** Fechado — `energy_mlp_security_v2`
**Fase:** Etapa 1A (Energy MLP — sub-modelo Security Score)
**Depende de:** Regime Score de MLP (spread AMLP−10y / rates / vol AMLP — **sem alterações**, inclusive o driver circular da Seção 3.5)
**Última atualização:** 2026-08-17

---

O v1 era `30% tendência + 30% yield bruto + 20% volume vs média − 20% σ`. Sem RSI (já correto). Esta revisão fecha o yield trap, o close puro, o volume em dólar e a vol invertida aditiva.

## Decisões fechadas

| Ponto | Decisão |
|---|---|
| RSI | **Continua fora** — Trend sozinho é o voto direcional; não nascer com a redundância Trend+RSI |
| Yield trap (3.1) | **Haircut anti-trap** (igual Preferred/REITs): `y_adj = y / (1 + max(z_252, 0))`, depois percentil. Coverage ratio (DCF) fica para 1B |
| Série de preço (3.2) | **Close do ETF** (`price_daily.close`). Não é total return |
| Volume (3.3) | **Dólar** (`close × ações`) |
| Oil beta (3.4) | **Fora.** Universo pontuado (AMLP, MLPX, ENFR, MLPA, EMLP, TPYP, AMZA, PYPE) é midstream/infra fee-based, não E&P. Fit a petróleo fica na classe Energy |
| Vol | **Percentil invertido, aditivo, 20d** — não mais `− σ_pct` |
| Pesos | **Manter 30 / 30 / 20 / 20** |
| Sinal | `inverte_percentil: true` só em `vol_realizada` |

Score final:

```
0.30 × percentil(tendência MM50/MM200, close)
+ 0.30 × percentil(y / (1 + max(z_252, 0)))
+ 0.20 × percentil(volume_dolar)
+ 0.20 × percentil(σ20)_invertido
```

Percentis 0–1 **dentro de MLP, no mesmo dia**. Não comparável com outras classes.

## Ingredientes

| Ingrediente | Peso | Direção |
|---|---|---|
| Price trend (média MM50 e MM200, price return) | 30% | percentil alto = mais acima das médias |
| Distribution yield (anti-trap) | 30% | percentil alto = maior **carry ajustado**, não yield de distress / return of capital inflado |
| Volume em dólar | 20% | percentil alto = maior `preço × ações` |
| Volatilidade realizada 20d | 20% | percentil alto = **menor** σ20 vs pares |

`z_252` = z-score do yield vs a própria história (~1 ano). z ≤ 0 → haircut 1. z = 2 → o yield entra no ranking com 1/3 do valor.

O spread AMLP vs Treasury 10y (`distribution_yield_spread`) é de **classe** e já está no Regime. No Security Score o que diferencia AMLP de MLPX é o yield **do nome**, com haircut se o preço desabou.

## Universo (3.4)

O sleeve pontuado na aba é ETF de midstream/infraestrutura, não MLP upstream. Por isso não há Oil Adherence aqui — essa pergunta é da classe Energy (XOP vs XLE).

## Fora de escopo

- Regime Score de MLP (incluindo o driver circular AMLP)
- Coverage ratio DCF/distribuições
- Universo (incluir LPs individuais EPD/ET)
