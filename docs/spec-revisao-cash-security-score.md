# Spec: Revisão do Security Score — Classe Cash

**Status:** Fechado — Proposta A em produção (`cash_security_v3`)
**Fase:** Etapa 1A (Cash — sub-modelo Security Score)
**Depende de:** Regime Score de Cash (sem alterações)
**Última atualização:** 2026-08-17

---

## Decisões fechadas

| Ponto | Decisão |
|---|---|
| Pesos | **Proposta A** — volume 50% / vol 20d 35% / \|MA50\| 15% |
| Distância da MA50 | **z-score** `(preço − MA50) / σ50` |
| Lookback da volatilidade | **20 dias** (10 dias fica como decisão futura) |
| Sinal | percentil invertido em vol e \|z\| da MA50; volume **não** inverte |

Score final:

```
0.50 × percentil_volume
+ 0.35 × percentil_volatilidade_invertido
+ 0.15 × percentil_distancia_MA50_z_invertido
```

Percentis 0–1 **dentro de Cash, no mesmo dia**. Não comparáveis com outras classes.

## Ingredientes

| Ingrediente | Peso | Direção |
|---|---|---|
| Volume negociado (bruto, no dia) | 50% | percentil alto = **maior** volume |
| Volatilidade realizada 20d | 35% | percentil alto = **menor** vol bruta |
| \|Preço − MA50\| / σ50 | 15% | percentil alto = **menor** \|z\| |

Volume é **volume bruto**, não volume vs a própria média. RSI e qualquer proxy de yield continuam fora.

## Fora de escopo

- Regime Score de Cash
- Bid-ask spread (melhoria futura)
- Lookback de vol 10 dias
- Proposta B (45/40/15)
