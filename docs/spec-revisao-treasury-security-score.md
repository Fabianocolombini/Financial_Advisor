# Spec: Revisão do Security Score — Classe Treasuries

**Status:** Fechado — Proposta B em produção (`treasury_security_v2`)
**Fase:** Etapa 1A (Treasuries — sub-modelo Security Score)
**Depende de:** Regime Score de Treasuries (stress override assimétrico — sem alterações)
**Última atualização:** 2026-08-17

---

## Decisões fechadas

| Ponto | Decisão |
|---|---|
| Duration | **Trend e RSI** — `trend_bruto / duration` e RSI sobre `retorno_diário / duration` |
| Pesos | **Proposta B** — 35% / 25% / 20% / 20% (redundância trend+RSI resolvida via duration, não via reweight) |
| COT | **hold_last** — última leitura semanal até a próxima divulgação; sem interpolação |
| Sinal | `inverte_percentil` só no COT (crowding alto abaixa a nota) |
| Volume | **bruto** (`volume_negociado`) |

Score final:

```
0.35 × percentil(tendência / duration)
+ 0.25 × percentil(RSI(retorno_diário / duration))
+ 0.20 × percentil(volume_bruto)
+ 0.20 × (1 − crowding_COT)
```

Percentis 0–1 **dentro de Treasuries, no mesmo dia**. COT é de classe (mesmo valor para todos os pontos da curva). Não comparável com outras classes.

## Ingredientes

| Ingrediente | Peso | Direção |
|---|---|---|
| Price trend / duration (média dos percentis MM50 e MM200) | 35% | percentil alto = mais acima das médias **por unidade de duration** |
| RSI 14d sobre retorno / duration | 25% | percentil alto = momentum mais forte **por unidade de duration** |
| Volume negociado (bruto) | 20% | percentil alto = **maior** volume |
| Positioning (COT), invertido | 20% | contribuição alta = **menor** crowding |

RSI permanece nesta classe: Treasuries têm reversão de taxa genuína, diferente de Cash. COT é o único voto contrário à tendência.

Duration é um **escalar de risco de taxa**, não um quarto ingrediente de fit (isso é o padrão IG/TIPS). O mapa está em `motor/config/treasury_duration_map.json`.

RSI é invariante à escala: `RSI(r/D) = RSI(r)` para duration constante no instrumento. Dividir o retorno por duration **antes** do RSI não muda a nota de um ticker isolado. O viés de convexidade da ponta longa é corrigido sobretudo no Price Trend (35%). O RSI permanece porque mede consistência de alta vs baixa — não amplitude — e Treasuries têm reversão de taxa genuína.

## Fora de escopo

- Regime Score de Treasuries (flight-to-quality vs inflation shock)
- Universo de instrumentos por ponto de curva
- Novos ingredientes (yield spread vs curva)
- Proposta A (30/20/20/30)
