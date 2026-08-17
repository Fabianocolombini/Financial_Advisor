# Spec: Security Score v2 — Classe Alternative Credit (BDC)

**Status:** Fechado — `bdc_security_v2`
**Fase:** Etapa 1A (Alternative Credit/BDC — sub-modelo Security Score)
**Depende de:** Regime Score de Alternative Credit (`bdc_regime_v1` — **sem alterações**)
**Última atualização:** 2026-08-17

---

O motor **já tinha** um v1 (`25% tendência + 30% NAV discount + 25% yield bruto − 20% σ`). Não havia descritivo fechado. Esta revisão substitui o v1 genérico (com yield trap e vol subtrativa) por um desenho de crédito: o que acontece **dentro da carteira de empréstimos** pesa mais do que o técnico de preço.

Markets agrupa a classe como `alt_bdc`; a aba do motor é `credito_alternativo`. A receita da UI precisa do alias.

## Decisões fechadas

| Ponto | Decisão |
|---|---|
| RSI | **Fora** — igual REITs/MLP/Cash. Trend sozinho é o voto direcional (15%) |
| Yield bruto | **Fora.** Yield trap resolvido por coverage (NII / dividendos), não por haircut de preço |
| Vol σ20 | **Fora.** O bug `− σ_pct` some porque o pilar some |
| Volume (5º ingrediente) | **Fora.** Quatro ingredientes; liquidez de nicho não entra nesta versão |
| Pesos | **30 / 30 / 25 / 15** (NAV discount / non-accrual invertido / NII coverage / tendência) |
| NAV | Nível **hold-last** trimestral (`nav_per_share`). O desconto é `(preço_as_of / NAV_hold − 1) × 100`. `inverte_percentil: true` no prêmio (maior desconto ranqueia mais alto) |
| Non-accrual | Por ticker, 10-Q/10-K, **hold-last** até o próximo filing. `inverte_percentil: true` |
| Distribution coverage | `NII / dividendos` parseado do 10-Q (heurística). **NII reportado**, não “operacional recorrente” — o HTML da SEC não deixa isolar incentive fee / itens não recorrentes de forma confiável (limitação 5.3 aceita) |
| Hold-last | Mesma regra COT: último valor conhecido com `data <= as_of`; sem forward-fill |
| Universo | **BDCs cotadas** no `universo` da aba (campo `edgar_metric`). HYG permanece no sleeve como overlay HY, sem EDGAR → percentil 0.5 nos pilares de crédito |
| Série de preço | **Close** (`price_daily.close`), price return, não total return |
| Leverage 2:1 | Fora de escopo (candidato 1B) |
| Regime | **Sem mudança.** SOFR / HY OAS / NAV e non-accrual de **classe** (proxy ARCC) continuam no Modelo 1 |

Score final:

```
0.30 × percentil(NAV premium, invertido)
+ 0.30 × percentil(non-accrual rate, invertido)
+ 0.25 × percentil(NII / dividendos)
+ 0.15 × percentil(tendência MM50/MM200, close)
```

Percentis 0–1 **dentro de BDCs cotadas, no mesmo dia**. Não comparável com outras classes. Dado ausente no pilar de crédito → 0.5 (mediana), não 0.

## Ingredientes

| Ingrediente | Peso | Direção |
|---|---|---|
| NAV Premium/Discount | 30% | percentil alto = **maior desconto** sobre NAV (`inverte_percentil` no prêmio `price/NAV − 1`) |
| Non-accrual rate | 30% | percentil alto = **menor** taxa de empréstimos que pararam de gerar juros |
| Distribution coverage | 25% | percentil alto = maior NII / dividendos pagos |
| Price trend | 15% | percentil alto = preço mais acima das médias MM50/MM200 |

## Triangulação NAV × non-accrual

Os dois pilares de 30% se checam: desconto grande com non-accrual baixo/estável é candidato a valor; desconto grande com non-accrual alto é provável value trap (o mercado pode estar correto em achar o NAV desatualizado). Não há termo multiplicativo — a checagem é a soma ponderada. Non-accrual é defasado (o empréstimo só entra depois que o problema já é visível); a triangulação reduz o risco de trap, não o elimina.

## Frequência e hold-last

| Pilar | O que congela | O que se move entre 10-Qs |
|---|---|---|
| NAV discount (30%) | NAV por cota (trimestral) | Preço de mercado diário no numerador |
| Non-accrual (30%) | Taxa reportada | Nada — hold-last |
| Coverage (25%) | NII / dividendos | Nada — hold-last |
| Trend (15%) | — | Close diário |

Entre divulgações, ~55% do score (NA + coverage) fica congelado. O desconto a NAV **não** fica 100% congelado porque o preço no numerador atualiza. Comportamento esperado, não bug de dado velho.

## NII (5.3)

Coverage usa o NII que o parser heurístico extrai do 10-Q (ratio explícito, ou NII/share ÷ DPS). Incentive fees de BDCs externamente geridas e itens não recorrentes **não** são expurgados. Missing parse → o ticker não entra no ranking daquele pilar (0.5).

## Universo (5.4)

Só BDCs com preço diário (yfinance). Non-traded BDCs não entram. HYG no JSON da aba não tem `edgar_metric` e não polui os percentis de crédito.

## Fora de escopo

- Regime Score de Alternative Credit
- Alavancagem dívida/patrimônio (teto 2:1 do 1940 Act)
- Internamente vs externamente geridas / setor do book
- Volume como 5º ingrediente
