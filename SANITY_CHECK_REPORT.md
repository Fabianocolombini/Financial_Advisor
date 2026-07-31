# PIS Milestone 1 — Sanity Check Report

Data de execução: 2026-05-25

## Resultado Geral

**Status: PARAR ANTES DA UI**

O critério de aceite da Fase 0 define que, se a cobertura de preços dos últimos 90 dias for menor que 80%, a implementação deve parar e reportar antes de avançar.

Resultado medido:

- Ativos ativos analisados: **659**
- Ativos com cobertura considerada completa nos últimos 90 dias (`>= 50` preços): **98**
- Cobertura: **14,87%**

Como **14,87% < 80%**, o Milestone 1 não deve seguir para layout, dependências, `/macro` ou páginas mockadas sem decisão explícita.

---

## 1. Distribuição por Tipo de Ativo

| Tipo | Quantidade |
|---|---:|
| EQUITY | 590 |
| ETF | 72 |
| COMMODITY | 5 |

Leitura:

- O universo está fortemente concentrado em equities.
- ETFs têm cobertura relevante como camada de benchmark/setor.
- Commodities existem no schema/universo, mas ainda são uma parcela pequena.
- Não há classe `BOND` separada no schema atual; renda fixa aparece principalmente como ETF.

---

## 2. Distribuição por Região

| Região | Quantidade |
|---|---:|
| us | 557 |
| international | 35 |
| europe | 26 |
| global | 14 |
| emerging | 14 |
| japan | 8 |
| canada | 4 |
| asia | 2 |
| china | 2 |
| developed_ex_us | 2 |
| brazil | 1 |
| australia | 1 |
| india | 1 |

Leitura:

- Cobertura dos EUA é dominante.
- Europa, mercados emergentes e Japão existem, mas ainda são sub-representados.
- Brasil, Austrália e Índia estão apenas simbolicamente representados.
- Para produto global, será necessário reforçar internacionalização do universo ou deixar claro que o MVP é majoritariamente US-centric.

---

## 3. Distribuição por Setor GICS

| Setor | Quantidade |
|---|---:|
| Financials | 106 |
| Information Technology | 85 |
| Industrials | 85 |
| Health Care | 69 |
| Consumer Discretionary | 60 |
| Consumer Staples | 44 |
| Real Estate | 36 |
| Utilities | 34 |
| Communication Services | 34 |
| Materials | 33 |
| Energy | 31 |
| Commodities | 5 |

Leitura:

- A distribuição setorial está razoavelmente ampla.
- Financials, Technology e Industrials são os setores mais populosos.
- Commodities já aparecem como setor próprio, mas com poucos instrumentos.

---

## 4. Cobertura de Preços nos Últimos 90 Dias

Critério usado:

- Ativo ativo (`is_active = true`)
- Contagem de preços em `qi_market_price_daily`
- Janela: `CURRENT_DATE - INTERVAL '90 days'`
- Completo se `price_count >= 50`

Resultado:

- Total de ativos ativos: **659**
- Ativos completos: **98**
- Cobertura completa: **14,87%**

Amostra dos ativos com menor cobertura:

| Symbol | Região | Preços 90d |
|---|---|---:|
| HES | us | 0 |
| ABB.SW | international | 0 |
| COPPER=F | global | 0 |
| ITX.MC | europe | 42 |
| ULVR.L | international | 42 |
| TEF.MC | europe | 42 |
| VNQ | us | 43 |
| IR | us | 43 |
| MCD | us | 43 |
| STE | us | 43 |
| HUM | us | 43 |
| WIT | emerging | 43 |
| VIS | us | 43 |
| NWS | us | 43 |
| NVS | international | 43 |
| CAG | us | 43 |
| CHD | us | 43 |
| REG | us | 43 |
| HPE | us | 43 |
| VHT | us | 43 |

Observação importante:

O limite `>= 50` pode estar agressivo para o estado atual da base porque muitos ativos têm cerca de **42–43 pregões** recentes. Isso pode indicar:

1. O último backfill parou em 2026-04-24, enquanto a data atual é 2026-05-25.
2. A janela de 90 dias usa `CURRENT_DATE`, mas a base está defasada cerca de um mês.
3. Muitos ativos provavelmente teriam cobertura aceitável se a ingestão diária tivesse continuado até hoje.

---

## 5. Profundidade Histórica

| Métrica | Valor |
|---|---|
| Data mais antiga | 2020-01-02 |
| Data mais recente | 2026-04-24 |
| Dias distintos com preços | 1.631 |

Leitura:

- A profundidade histórica é boa.
- O problema não é histórico total, mas **recência**.
- A base de preços está desatualizada em relação à data atual.

---

## 6. Snapshot Atual do Regime Macro

| Região | Data | Regime | Score |
|---|---|---|---:|
| EM | 2026-04-26 | INFLATION | 0.75000000 |
| EU | 2026-04-26 | INFLATION | 0.75000000 |
| JP | 2026-04-26 | INFLATION | 0.75000000 |
| US | 2026-04-26 | EXPANSION | 1.00000000 |

Também existe um snapshot sem região explícita no `model_version`, com `INFLATION`.

Leitura:

- O regime macro está calculado, mas também está defasado para 2026-04-26.
- Para um dashboard publicado, é recomendável exibir claramente a data da última análise.
- A UI deve tratar dados defasados com um alerta ou badge de stale data.

---

## 7. Última Análise Setorial

| Rank | Setor | Score |
|---:|---|---:|
| 1 | Information Technology | 0.81882183 |
| 2 | Industrials | 0.76339316 |
| 3 | Consumer Discretionary | 0.74947662 |
| 4 | Financials | 0.66144749 |
| 5 | Materials | 0.65233884 |
| 6 | Communication Services | 0.64009267 |
| 7 | Energy | 0.60069010 |
| 8 | Health Care | 0.51713400 |
| 9 | Real Estate | 0.50659361 |
| 10 | Commodities | 0.48339963 |
| 11 | Consumer Staples | 0.43214966 |
| 12 | Utilities | 0.40233625 |

Leitura:

- Ranking setorial está disponível e parece coerente com regime `EXPANSION`.
- Há 12 setores, incluindo `Commodities`.
- O MD fala em 11 setores GICS; o produto atual deve decidir se `Commodities` entra como setor extra ou bloco separado.

---

## 8. Recomendações Vivas

Critério consultado:

- `created_at >= CURRENT_DATE - INTERVAL '7 days'`

Resultado:

- Recomendações nos últimos 7 dias: **0**

Leitura:

- Existem recomendações históricas no banco, mas não há recomendações “vivas” nos últimos 7 dias.
- Isso reforça que o pipeline está defasado.
- Para `/macro`, isso não bloqueia regime/setores, mas para `/oportunidades` real seria problemático.
- Como o MD define `/oportunidades` com mock nesta sprint, isso não bloqueia a UI mockada, mas bloqueia uma narrativa de “dados atualizados”.

---

## 9. Saúde dos Jobs

Últimos jobs consultados:

| Job | Status | Observação |
|---|---|---|
| institutional_13f | SUCCESS | count baixo / sem dados úteis |
| insider_form4 | SUCCESS | count baixo / sem dados úteis |
| cot_positions | SUCCESS | COT parcial |
| daily_ohlcv_yf | SUCCESS | última execução em 2026-04-26 |
| fundamentals_ttm | SUCCESS | última execução em 2026-04-26 |
| macro_expanded | SUCCESS | última execução em 2026-04-26 |
| macro_observations | SUCCESS | última execução em 2026-04-26 |
| recommendation_engine | SUCCESS | última execução em 2026-04-26 |
| sector_rotation | SUCCESS | última execução em 2026-04-26 |
| regime_engine | SUCCESS | última execução em 2026-04-26 |
| universe_build | SUCCESS | última execução em 2026-04-26 |

Resultado:

- Não há jobs recentes com `FAILED` na amostra.
- Porém, os jobs são antigos em relação à data atual.
- O problema principal é recência / atualização do pipeline, não falha registrada.

---

## 10. Respostas Objetivas da Fase 0

### Quantos ativos têm dados completos nos últimos 90 dias?

**98 de 659 ativos ativos**, ou **14,87%**.

### Qual a distribuição real entre equities/ETFs/bonds/commodities?

- Equities: **590**
- ETFs: **72**
- Commodities: **5**
- Bonds: não existem como classe própria; aparecem por ETFs de renda fixa.

### Quais países/regiões estão bem cobertos vs sub-representados?

Bem coberto:

- `us`: 557 ativos

Cobertura moderada:

- `international`: 35
- `europe`: 26
- `global`: 14
- `emerging`: 14

Sub-representados:

- `japan`: 8
- `canada`: 4
- `asia`: 2
- `china`: 2
- `developed_ex_us`: 2
- `brazil`: 1
- `australia`: 1
- `india`: 1

### O regime atual de cada país bate com o que se espera do mercado real hoje?

Não é possível afirmar com confiança para “hoje”, porque os snapshots são de **2026-04-26**.

O estado calculado é:

- US: `EXPANSION`
- EU: `INFLATION`
- JP: `INFLATION`
- EM: `INFLATION`

Para produto, a UI deve mostrar a data da última análise e sinalizar defasagem.

### Há jobs com falha recente?

Na amostra dos últimos 20 jobs, **não há `FAILED`**.

Mas os jobs são de 2026-04-26; portanto, a saúde operacional não está atualizada.

---

## 11. Decisão Recomendada Antes de Seguir

Como o critério de cobertura falhou, há três caminhos possíveis:

### Opção A — Atualizar ingestão antes da UI

Rodar:

```bash
QI_INGEST_PHASE=yfinance QI_YFINANCE_INCREMENTAL=false npm run qi:ingest
npm run qi:analysis
```

Depois repetir a Fase 0.

Vantagem:

- Dashboard nascerá com dados realmente recentes.

Risco:

- Ingestão pode demorar bastante.

### Opção B — Prosseguir com UI apesar da cobertura baixa

Só seguir se o objetivo for validar casca visual e navegação.

Nesse caso, a UI deve incluir:

- badge “dados defasados”;
- data da última análise;
- mensagens claras quando indicadores estiverem indisponíveis.

### Opção C — Ajustar critério de cobertura

Como muitos ativos têm 42–43 preços recentes, pode ser que o threshold `>=50` esteja desalinhado com o estado atual dos dados.

Poderia redefinir o critério como:

- `>= 40` preços nos últimos 90 dias; ou
- cobertura até `MAX(trade_date)` da base, em vez de `CURRENT_DATE`.

Mas isso seria uma alteração de critério, não execução literal do MD.

---

## 12. Conclusão

O Milestone 1 **não deve avançar para código de UI ainda** sob as regras do próprio documento.

Motivo:

- Cobertura de preços dos últimos 90 dias: **14,87%**
- Limite exigido: **80%**

Próxima ação recomendada:

1. Rodar ingestão yfinance para atualizar preços até a data atual.
2. Rodar `npm run qi:analysis`.
3. Reexecutar Fase 0.
4. Se cobertura passar de 80%, avançar para Fase 1.

