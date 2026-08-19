# Guia de Decisão de Entrada por Sleeve (classe de ativo)

Racional **qualitativo** de quando o *regime* da classe fica favorável (VIX, spreads, curva…).  
A **árvore que o motor grava** em `entryTiming` (Money `+` `…` `×`) está em [motor-timing-entrada-por-classe.md](motor-timing-entrada-por-classe.md). Este guia alimenta o Regime Score; não é o if/else da coluna Money.

## Princípio geral

- **Ascendente:** ciclo favorável à classe; entrada parcial ou aumento gradual.
- **Maduro:** manter ou não acelerar; foco em valuation e técnico.
- **Descendente:** reduzir exposição ou aguardar; exceção = papel individual divergindo positivamente.

## Por classe (resumo)

| Classe | Entrada favorável quando | Evitar quando |
|--------|--------------------------|---------------|
| **Taxas (RF Soberana)** | Curva normalizando, Fed em pausa/corte, yield real elevado | Fed hawkish, curva invertida piorando |
| **RF IG** | Spreads IG alargados vs histórico, macro estável | Spreads comprimidos, downgrades em série |
| **Crédito Alt / HY** | Spreads HY altos, non-accrual baixo, NAV desconto | HY−IG comprimido, non-accrual subindo |
| **Dividendos** | Yield z-score alto, payout sustentável, dividend growth | Yield só por queda de preço, payout > 90% |
| **Mercado Amplo** | VIX elevado + valuation abaixo da média | VIX baixo + P/E esticado |
| **REITs** | P/FFO abaixo da média, spreads cap rate vs Treasury altos | Dívida/EBITDA deteriorando |
| **Infra** | Coverage ratio saudável, commodity estável | Dívida subindo, commodity em stress |
| **Commodities** | Yield real TIPS baixo, COT não crowded long | Dólar forte + posicionamento especulativo long |
| **TIPS** | Breakeven inflação baixo vs CPI realizado | Breakeven já precifica inflação alta |
| **FX** | Diferencial de juros favorável, PPP desalinhado | Diferencial apertando |
| **Caixa** | Spread caixa vs long end alto (oportunidade em duration) | Yield real de caixa negativo |
| **Satélite** | Momentum relativo + receita acelerando | Burn rate alto sem runway |
| **Emergentes** | P/E relativo EM vs US baixo, fluxo favorável | Diferencial de juros apertando vs US |

## Granularidade (papel vs categoria)

1. Calcular estágio da **aba** (score agregado macro + valuation da classe).
2. Calcular **S_ativo** para cada ticker no `universo`.
3. Se `estagio_ativo=Ascendente` e `estagio_aba=Descendente` → candidato a divergência positiva (ex.: BDC com NAV desconto enquanto HY spread agregado comprimido).

Ver implementação em `motor/src/decisao/estagio.py` e relatório em `gerar_relatorio.py`.
