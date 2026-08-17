# Spec: Revisão do Security Score — Classe Emerging Markets

**Status:** Fechado — `em_equity_security_v2`
**Fase:** Etapa 1A (Emerging Markets — sub-modelo Security Score)
**Depende de:** Regime Score de Emerging Markets (USD / EMBI / commodities / China — **sem alterações**)
**Última atualização:** 2026-08-17

---

## Decisões fechadas

| Ponto | Decisão |
|---|---|
| Trend + RSI (3.1) | **Manter 30% + 20%** — mesma linha das outras classes (não reweight) |
| Volume (3.2) | **Volume em dólar** (`close × ações`) — mesma correção de US Stocks; em EM o viés de preço unitário é ainda mais distorcivo |
| Stability / vol (3.3) | **Ausência intencional neste sleeve.** O universo pontuado é ETF amplo em USD (EEM, VWO, IEMG, SCHE, SPEM, EMXC): a vol estrutural de EM é propriedade da **classe** (já no Regime: VIX + DXY stress). Liquidez diferencia os veículos; σ20 entre esses ETFs no mesmo dia é pouco informativa. Não é 5º ingrediente |
| China Exposure (3.4) | **Métrica de distância:** `1 − \|P(β_FXI) − 0.60\|`, `tipo_metrica: "distancia_ao_alvo"`. Beta **com sinal** (não \|β\|): EMXC deve ficar na ponta baixa, não parecer “exposto” por magnitude |
| Bucket (3.5) | **Confirmado:** fator de **mix China do ETF** (EEM vs EMXC). Mesmo β vs FXI → mesmo fit, independente do nome |
| Currency Exposure 5º (4) | **Adiar para pós-1A.** Quebra o padrão de 4 técnicos. DXY já está no Regime Score. O sleeve é cota USD — beta vs UUP/DTWEXEMEGS não ranquearia esses ETFs de forma limpa (mesmo veículo cambial). Sem série local, igual International |
| Sinal | `inverte_percentil: false` nos três primeiros. China Exposure não inverte: o fit já é “mais perto = melhor” |

Score final:

```
0.30 × percentil(tendência MM50/MM200)
+ 0.20 × percentil(RSI)
+ 0.20 × percentil(volume_dolar)
+ 0.30 × (1 − |P(β vs FXI) − 0.60|)
```

Percentis 0–1 **dentro de Emerging Markets, no mesmo dia**. Não comparável com outras classes. Alvo de China = percentil 0.60 de beta vs FXI (acima da mediana do sleeve — a classe é estruturalmente China-tilted).

## Ingredientes

| Ingrediente | Peso | Direção |
|---|---|---|
| Price trend (média MM50 e MM200) | 30% | percentil alto = mais acima das médias |
| RSI 14d | 20% | percentil alto = momentum mais forte |
| Volume em dólar | 20% | percentil alto = maior `preço × ações` |
| China exposure (fit vs FXI) | 30% | fit alto = β_China mais perto do alvo da classe |

## Por que Volume e não Stability

US e International descontam σ20 porque o sleeve mistura nomes com vol bem diferente. Aqui o sleeve é **seis ETFs de EM amplo** — a vol do dia é quase um fator de classe. O gargalo operacional entre EEM e um fundo menor (SPEM, SCHE) é **liquidez em dólar**, não o swing. Vol de EM como bloco (dólar forte + VIX) já capea o Regime (`em_stress`). Se o universo virar país/ação individual, Stability volta à mesa.

## Por que não adicionar FX agora

| Fonte | O que há | Ranqueia EEM vs VWO vs EMXC? |
|---|---|---|
| FRED `DTWEXBGS` / DXY | Já no Regime + stress | Classe, não ticker |
| FRED `DTWEXEMEGS` (dólar vs EM) | Índice de classe, se mapeado | Classe, não ticker |
| yfinance UUP beta | Todos os nomes são ETFs em USD | Quase o mesmo β para o sleeve |
| Moeda local (BRL, ZAR, TRY…) | Sem série por ETF multi-país | Não |

A assimetria com International é real no desenho da **classe**, e está no Regime (USD fraco é o maior peso). Não cabe um 5º técnico sem série que diferencie os tickers.

## China Exposure é bucket (3.5)

`P(β_FXI)` ordena os ETFs pela carga estrutural de China (EMXC na ponta baixa, EEM/VWO no meio-alto). O alvo 0.60 é **o mesmo para todos no dia**. Dois nomes com o mesmo beta recebem o mesmo fit. Sentimento China do **bloco** continua em EMEquityRegimeScore (`china_z`).

## Fora de escopo

- Regime Score de Emerging Markets
- Universo (países, ADRs vs locais)
- Neutralização por país fora da China (3.6)
- P/E / ROE — mesma decisão de US/International
- Proposta A/B com 5º ingrediente cambial
