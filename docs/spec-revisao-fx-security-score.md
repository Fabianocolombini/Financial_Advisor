# Spec: Revisão do Security Score — Classe FX

**Status:** Fechado — `fx_security_v2`
**Fase:** Etapa 1A (FX — sub-modelo Security Score)
**Depende de:** Regime Score de FX (`fx_regime_v1` / ConversionPaceScore — **sem alterações**)
**Última atualização:** 2026-08-17

---

O v1 era `50% expense invertido (`1 − p`) + 30% volume vs média + 20% fit |β vs UUP| ao alvo 0.25`. Sem Trend/RSI (já correto: o Security Score escolhe o **veículo**, a direção cambial está no Regime). Esta revisão adiciona carry por ticker e tracking error vs spot, passa liquidez para volume em dólar, e troca o invert de expense para percentil invertido aditivo.

## Decisões fechadas

| Ponto | Decisão |
|---|---|
| Versão | **V2 Completo** (expense + $ volume + dollar fit + carry + TE). Não Mínimo, não v1 |
| Trend / RSI | **Continua fora** — FX aqui é eficiência de veículo, não timing |
| Score quasi-estático (3.1) | **Aceito.** Expense e o mandato de $ exposure são propriedades do fundo. Carry muda em reunião de banco central (hold-last). O que se mexe no dia é volume em dólar e TE 63d |
| Carry | **Monotônico:** `taxa_da_moeda_que_o_ETF_segura − DFF` (long USD: `DFF − média das taxas do basket`). **Não** é distância ao alvo. Não reusa o `carry_penalty` de classe do Regime (constante no dia, não ranqueia UUP vs FXE) |
| Dollar exposure | **Distância ao alvo** (`tipo_metrica: distancia_ao_alvo`): `1 − \|P(\|β vs UUP\|) − 0.25\|`. Mesmo padrão Intl/EM/Energy. Alvo 0.25 herdado do v1 |
| Liquidez | **Volume em dólar** (`close × ações`). Bid-ask fica para 1B |
| Tracking error | σ anualizada do ativo vs spot FRED, **63 sessões**, invertida. FXE vs `DEXUSEU`; FXY vs `−DEXJPUS` (yen); UUP vs `DTWEXBGS` (proxy broad; UUP rastreia DXY). CEW sem par único → 0.5 |
| Expense | Percentil **invertido aditivo** — não mais `1 − p` |
| Pesos | **20 / 20 / 15 / 30 / 15** |
| Crash risk de carry (5.1) | Limitação aceita; sem pilar de vol cambial nesta versão |
| Universo | Sem reabrir (UUP, FXE, FXY, CEW) |
| Regime | **Sem mudança** (REER / carry de classe / crowding) |

Score final:

```
0.20 × percentil(expense)_invertido
+ 0.20 × percentil(volume_dolar)
+ 0.15 × (1 − |P(|β_UUP|) − 0.25|)
+ 0.30 × percentil(carry)
+ 0.15 × percentil(tracking error vs spot)_invertido
```

Percentis 0–1 **dentro de FX, no mesmo dia**. Dado ausente → 0.5.

## Ingredientes

| Ingrediente | Peso | Direção |
|---|---|---|
| Expense ratio | 20% | percentil alto = **menor** taxa |
| Volume em dólar | 20% | percentil alto = maior `preço × ações` |
| Dollar exposure (fit) | 15% | mais perto do alvo 0.25 de \|β vs UUP\| |
| Carry | 30% | percentil alto = maior diferencial a favor da moeda que o ETF segura |
| Tracking error vs spot | 15% | percentil alto = **menor** TE 63d |

## Carry por ticker

| ETF | O que segura | Carry |
|---|---|---|
| FXE | EUR | ECB deposit (ou `IRSTCI01EZM156N`) − DFF |
| FXY | JPY | `IRSTCI01JPM156N` − DFF |
| CEW | cesta EM | `IRSTCI01BRM156N` (proxy Brasil) − DFF |
| UUP | USD (short DXY) | DFF − média(ECB, JPY) |

Taxas em % (hold-last). CEW e o basket do UUP são proxies — documentado.

## Tracking error

`TE = stdev(r_ETF − r_spot) × √252` nas últimas 63 sessões com par alinhado. `DEXJPUS` é JPY por USD: o retorno de spot para FXY é o **inverso**. Sem 20 observações → 0.5.

## Por que o Regime não entra no carry do Security

`fx_carry_penalty` no ConversionPaceScore é Fed−ECB **de classe**, o mesmo número para UUP e FXE naquele dia. Colocar isso no Security Score não muda o ranking. Aqui o carry é **do ticker**.

## Fora de escopo

- Regime Score / alvo de dollar exposure (0.25 mantido)
- Vol cambial como contrapeso ao crash de carry
- Universo (alavancados, pares forex crus)
- Bid-ask no lugar de volume em dólar
