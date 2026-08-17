# Spec: Revisão do Security Score — Classe US Stocks

**Status:** Fechado — `us_equity_security_v2`
**Fase:** Etapa 1A (US Stocks — sub-modelo Security Score)
**Depende de:** Regime Score de US Stocks (CAPE / earnings revision / sentiment / margin debt — **sem alterações**)
**Última atualização:** 2026-08-17

---

## Decisões fechadas

| Ponto | Decisão |
|---|---|
| Volume (3.2) | **Volume em dólar** (`close × volume em ações`) — o volume em ações favorece mecanicamente nomes de preço unitário baixo |
| Neutralização setor / tamanho (3.3) | **Universo inteiro da aba.** O sleeve pontuado hoje é ETF (SPY, QQQ, IWM, VOO); GICS/cap-size é arquitetura nova, fica para 1B se o universo virar ações individuais |
| Trend + RSI (3.1 / 3.5) | **Manter 35% + 25%** — mesma linha de Treasuries/IG/HY/TIPS (não reweight por redundância) |
| Vol (3.4 / 3.6) | **Percentil invertido, aditivo, lookback 20d** — não mais `− σ_pct`. Assim 0.5 continua o nome mediano. Vol idiossincrática vs beta fica fora desta rodada |
| Sinal | `inverte_percentil: true` só em `vol_realizada` |
| Ingrediente fundamentalista (4) | **Adiar para pós-Etapa 1A.** Manter 4 indicadores técnicos, consistente com as outras 16 classes. P/E e ROE (yfinance) ficam registrados como candidatos 1B; earnings revision pago (I/B/E/S) fora |

Score final:

```
0.35 × percentil(tendência MM50/MM200)
+ 0.25 × percentil(RSI)
+ 0.20 × percentil(volume_dolar)
+ 0.20 × percentil(σ20)_invertido
```

Percentis 0–1 **dentro de US Stocks, no mesmo dia**. Não comparável com outras classes.

## Ingredientes

| Ingrediente | Peso | Direção |
|---|---|---|
| Price trend (média MM50 e MM200) | 35% | percentil alto = mais acima das médias |
| RSI 14d | 25% | percentil alto = momentum mais forte |
| Volume em dólar | 20% | percentil alto = maior `preço × ações negociadas` |
| Volatilidade realizada 20d | 20% | percentil alto = **menor** σ20 vs pares |

## Por que não adicionar P/E / ROE agora

O modelo 100% técnico é uma escolha de desenho da camada de seleção, não uma lacuna equivalente à de Preferred (income). Adicionar um quinto ingrediente fundamentalista quebra o padrão das 17 classes (1 regime + 4 técnicos) e é exatamente o tipo de expansão que o QI anterior não resistiu. yfinance já está no pipeline, então o custo incremental é baixo — mas o fechamento de 1A não deve esperar isso.

## Fora de escopo

- Regime Score de US Stocks
- Universo de instrumentos (índice, filtro de liquidez)
- Neutralização por setor GICS ou faixa de market cap
- Volatilidade idiossincrática vs beta
- Earnings revision (I/B/E/S / Zacks) — sem fonte gratuita mapeada
- Proposta A/B de reweight e Proposta C/D com quinto ingrediente
