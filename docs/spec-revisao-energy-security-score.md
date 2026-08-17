# Spec: Revisão do Security Score — Classe Energy

**Status:** Fechado — `commodities_energy_security_v2`
**Fase:** Etapa 1A (Energy — sub-modelo Security Score)
**Depende de:** Regime Score de Energy (curva / estoques / rigs / WTI / COT — **sem alterações**)
**Última atualização:** 2026-08-17

---

O v1 era `35% tendência + 20% RSI + 20% volume vs média + 25% beta fit vs USO`. Oil Adherence já era distância ao alvo 0.70; Trend/RSI não eram escalados pelo beta. Esta revisão fecha os dois.

## Decisões fechadas

| Ponto | Decisão |
|---|---|
| Trend e RSI / \|β_óleo\| (3.1) | **Sim** — mesma lógica de duration em Treasuries/IG/TIPS: `trend / max(\|β\|, 0.25)` e RSI sobre `retorno / max(\|β\|, 0.25)`. Piso 0.25 evita explosão em nomes quase sem beta (UNG) |
| Oil Adherence (3.2) | **Distância**, não direção: `1 − \|P(β_USO) − 0.70\|`, `tipo_metrica: "distancia_ao_alvo"`. Não inverte |
| Bucket (3.3) | **Confirmado:** fator de **subsetor** (E&P vs integrada vs midstream vs gás). Mesmo β vs USO → mesmo fit, independente do nome |
| Trend + RSI (3.4) | **Manter 35% + 20%** — não reweight por redundância |
| Volume (3.5) | **Dólar** (`close × ações`) — USO, XLE, XOP, UNG têm preço unitário muito diferente |
| 5º ingrediente | **Fora** — estoques EIA, rigs, COT WTI, OPEC já estão no Regime e são de classe, não de ticker |
| Benchmark (3.7) | **USO** (proxy WTI, close diário alinhado aos ETFs). Não Brent, não blend, não spot FRED (`DCOILWTICO` fica no Regime) |
| Sinal | nenhum `inverte_percentil`; Oil Adherence usa `tipo_metrica` |

Score final:

```
0.35 × percentil(tendência / max(|β_USO|, 0.25))
+ 0.20 × percentil(RSI(retorno / max(|β_USO|, 0.25)))
+ 0.20 × percentil(volume_dolar)
+ 0.25 × (1 − |P(β_USO) − 0.70|)
```

Percentis 0–1 **dentro de Energy, no mesmo dia**. Não comparável com outras classes. Alvo de oil adherence = percentil 0.70 de beta vs USO (ligeiramente acima da mediana do sleeve).

## Ingredientes

| Ingrediente | Peso | Direção |
|---|---|---|
| Price trend / \|β_óleo\| (média MM50 e MM200) | 35% | percentil alto = mais acima das médias **por unidade de beta ao óleo** |
| RSI 14d sobre retorno / \|β_óleo\| | 20% | percentil alto = momentum mais forte **por unidade de beta** |
| Volume em dólar | 20% | percentil alto = maior `preço × ações` |
| Oil adherence (fit vs USO) | 25% | fit alto = β_óleo mais perto do alvo da classe |

Oil Adherence **não** normaliza Trend/RSI — pergunta diferente (“esse subsetor de beta cabe no sleeve?”). Os dois convivem: Trend/RSI / \|β\| (viés de E&P) **e** fit (alocação de bucket).

RSI é invariante à escala no instrumento; o viés de high-beta é corrigido sobretudo no Price Trend.

## Benchmark (3.7)

| Hipótese | O que o código usa |
|---|---|
| Spot WTI FRED (`DCOILWTICO`) | Regime Score (`spot_wti`) — calendário de commodity, não close de ETF |
| Brent / BNO | **Não.** O universo pontuado (USO, XLE, XOP, UNG) é WTI-ligado; BNO não está no sleeve |
| Blend WTI+Brent | **Não** — um FX/óleo único não isola majors internacionais |
| USO | **Sim.** Mesmo papel que FXI no EM e UUP no International: veículo listado, retorno diário alinhado |

Beta **com sinal** no fit (UNG na ponta baixa). O divisor de Trend/RSI é `max(\|β\|, 0.25)` — escala, não direção.

## Fora de escopo

- Regime Score de Energy
- Universo por subsetor (E&P, midstream, integradas, refino, serviços)
- Neutralização setorial além do /β (3.6)
- Valuation/qualidade — mesma decisão de US Stocks (1B)
- 5º ingrediente de commodity agregada
