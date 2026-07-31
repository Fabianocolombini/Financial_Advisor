# Financial Advisor / QI — Briefing de Produto e Milestones

Documento para discussão antes da próxima etapa de implementação.

Objetivo: consolidar onde o projeto parou, o que já está pronto no backend quantitativo, o que ainda falta para transformar a camada QI em experiência visual de produto, e quais decisões devem ser discutidas antes de começar a codar o próximo milestone.

---

## 1. Contexto do Produto

O projeto **Financial Advisor** nasceu como uma aplicação de planejamento financeiro pessoal e evoluiu para incluir uma camada de **Quantitative Intelligence (QI)** voltada a análise macro, rotação setorial e recomendação de ativos.

A visão de produto final é combinar:

- Planejamento financeiro pessoal: objetivos, patrimônio, orçamento e transações.
- Inteligência de mercado: regime macro, risco, setores favorecidos, recomendações e indicadores.
- Visualização clara para usuário final: gráficos, badges, explicações e alertas.
- Pipeline automatizado: ingestão diária, análise diária e dashboard sempre atualizado.

Importante: a camada QI deve ser apresentada como **informação educacional e suporte à decisão**, não como assessoria de investimento regulada.

---

## 2. Onde Paramos

### 2.1 Backend da aplicação pessoal

Já existe uma aplicação Next.js com:

- Next.js 16 App Router.
- React 19.
- TypeScript.
- Prisma 6.
- PostgreSQL local / Neon.
- Auth.js v5.
- Layout em `app/(dashboard)/`.
- Páginas principais:
  - `/`
  - `/objetivos`
  - `/patrimonio`
  - `/orcamento`
  - `/mercado`

Funcionalidades já implementadas:

- Autenticação.
- CRUD de objetivos financeiros.
- CRUD de patrimônio.
- CRUD de orçamento.
- CRUD de transações.
- APIs REST internas para essas entidades.

### 2.2 Backend quantitativo QI

Foi implementado um pipeline quantitativo em Python dentro de `analytics/qi/`.

Principais blocos:

- Ingestão macro via FRED.
- Ingestão de preços via yfinance.
- Ingestão de fundamentos via FMP.
- Ingestão COT via CFTC.
- Estrutura inicial para EDGAR Form 4 e 13F.
- Construção de universo global de ativos.
- Engine de regime macro.
- Engine de rotação setorial.
- Engine de recomendações.
- Scheduler Python.
- Logging em `qi_ingestion_job`.

### 2.3 Estado do banco local

Levantamento feito na base local `pis_dev`.

| Tabela | Registros | Observação |
|---|---:|---|
| `qi_asset` | 667 | Universo de ativos monitorados |
| `qi_market_price_daily` | 1.079.097 | Histórico OHLCV diário |
| `qi_macro_series` | 36 | Séries macro cadastradas |
| `qi_macro_series_point` | 22.722 | Pontos FRED ingeridos |
| `qi_fundamental_snapshot` | 129 | Fundamentals via FMP |
| `qi_ingestion_job` | 39 | Histórico de jobs |
| `qi_universe_run` | 17 | Rodadas de construção de universo |
| `qi_universe_member` | 930 | Membros de universo |
| `qi_regime_snapshot` | 5 | Regimes calculados |
| `qi_sector_score_snapshot` | 12 | Setores ranqueados |
| `qi_recommendation` | 15 | Recomendações geradas |
| `qi_cot_position` | 156 | COT parcial |
| `qi_insider_transaction` | 0 | EDGAR Form 4 ainda sem dados úteis |
| `qi_institutional_holding` | 0 | 13F ainda sem dados úteis |

### 2.4 Estado analítico mais recente

Regimes:

- `US`: `EXPANSION`
- `EU`: `INFLATION`
- `JP`: `INFLATION`
- `EM`: `INFLATION`

Top setores:

1. Information Technology
2. Industrials
3. Consumer Discretionary
4. Financials
5. Materials
6. Communication Services

Recomendações existentes:

- Há recomendações gravadas em `qi_recommendation`.
- O payload inclui `symbol`, `action`, `regime`, `region` e rationale com componentes de score.
- Exemplos observados: `ORCL`, `NOW`.

---

## 3. O Que Foi Implementado por Camada

### 3.1 Schema e banco

Modelos QI no Prisma:

- `QiAsset`
- `QiAssetIdentifier`
- `QiMarketPriceDaily`
- `QiMacroSeries`
- `QiMacroSeriesPoint`
- `QiFundamentalSnapshot`
- `QiIngestionJob`
- `QiUniverseRun`
- `QiUniverseMember`
- `QiUniverseConfig`
- `QiRegimeSnapshot`
- `QiSectorScoreSnapshot`
- `QiRecommendation`
- `QiCotPosition`
- `QiInsiderTransaction`
- `QiInstitutionalHolding`

Último commit relevante:

- `938b88b feat(qi): expand ingestion sources with EDGAR and COT hardening`

### 3.2 Ingestão

Arquivos principais:

- `analytics/qi/jobs/run_ingest_daily.py`
- `analytics/qi/ingest/fred_client.py`
- `analytics/qi/ingest/yfinance_client.py`
- `analytics/qi/ingest/fmp_client.py`
- `analytics/qi/ingest/cftc_client.py`
- `analytics/qi/ingest/edgar_insider_client.py`
- `analytics/qi/ingest/edgar_13f_client.py`

Scripts npm:

- `npm run qi:preflight`
- `npm run qi:ingest`
- `npm run qi:ingest:fred-expanded`
- `npm run qi:ingest:cot`
- `npm run qi:ingest:insider`
- `npm run qi:ingest:institutional`
- `npm run qi:build-universe`
- `npm run qi:analysis`
- `npm run qi:scheduler`

### 3.3 Universo de ativos

O universo foi redesenhado para evitar concentração em ETFs mega-líquidos.

Estrutura atual:

- Pool A: ETFs curados.
- Pool B: equities por setor GICS, com anti-concentração.
- Pool C: commodities.

Resultado: universo com diversidade setorial e mais adequado para recomendação por setor.

### 3.4 Análise

Arquivos principais:

- `analytics/qi/analysis/regime_engine.py`
- `analytics/qi/analysis/sector_rotation.py`
- `analytics/qi/analysis/recommendation_engine.py`
- `analytics/qi/jobs/run_analysis_daily.py`

Fluxo:

1. Ingestão de dados.
2. Construção / atualização de universo.
3. Classificação de regime macro.
4. Score de setores.
5. Recomendações por ativo.

---

## 4. Estado Atual do Frontend

### 4.1 O que existe

Página atual de QI:

- `app/(dashboard)/mercado/page.tsx`

Ela já consulta:

- `qiRegimeSnapshot`
- `qiSectorScoreSnapshot`
- `qiRecommendation`

Mas ainda exibe a informação de forma simples, majoritariamente textual.

APIs QI existentes:

- `GET /api/qi/regime`
- `GET /api/qi/sectors`
- `GET /api/qi/recommendation`
- `GET /api/qi/portfolio`

### 4.2 Principal gap

O backend quantitativo está muito mais avançado que a experiência visual.

Hoje o produto ainda não mostra bem:

- Gráfico de evolução macro.
- Gráfico de ranking setorial.
- Histórico de score dos setores.
- Explicação visual da recomendação.
- Conviction score por componente.
- Posição COT.
- Estado de saúde dos jobs.
- Evolução do patrimônio conectada ao regime macro.

O próximo passo de maior impacto é transformar `/mercado` em um dashboard visual.

---

## 5. Problemas Pendentes

### 5.1 EDGAR Form 4

Estado:

- Cliente criado.
- Tabela criada.
- Job integrado.
- Ainda retorna 0 transações.

Hipótese:

- Endpoint e parser ainda não estão robustos o suficiente.
- O documento principal nem sempre é o XML final.
- É necessário inspecionar `index.json` do filing e localizar o XML correto.

Critério para considerar pronto:

- `qi_insider_transaction` com pelo menos 50 transações.
- Mix de compras (`P`) e vendas (`S`).
- Logs mostrando filings encontrados e transações parseadas.

### 5.2 EDGAR 13F

Estado:

- Cliente criado.
- Tabela criada.
- Job integrado.
- Ainda retorna 0 holdings.

Hipótese:

- O 13F-HR geralmente separa o `infotable.xml`.
- O parser ainda não está localizando corretamente esse arquivo.
- O match por ticker/CUSIP precisa ser melhorado.

Critério para considerar pronto:

- Pelo menos 3 fundos.
- Pelo menos 20 posições.
- Dados suficientes para cálculo de crowding.

### 5.3 COT parcial

Estado:

- `qi_cot_position` tem 156 linhas.
- Há dados para poucos mercados.

Objetivo:

- Aumentar cobertura para pelo menos 7 mercados:
  - GOLD
  - COPPER
  - CRUDE OIL
  - NATURAL GAS
  - S&P 500
  - NASDAQ-100
  - EUR/USD
  - T-BONDS
  - T-NOTES 10Y

### 5.4 Produto visual ainda inexistente

Estado:

- Dados existem.
- APIs parcialmente existem.
- UI ainda não é dashboard final.

Objetivo:

- Criar uma camada visual clara, com gráficos e indicadores.

---

## 6. Opções de Caminho Agora

### Opção A — Construir primeiro o dashboard `/mercado`

Foco:

- Transformar dados existentes em produto visual.

Vantagens:

- Maior percepção de evolução do produto.
- Usa dados que já existem.
- Permite validar UX antes de continuar expandindo ingestão.
- Ajuda a descobrir quais dados realmente são úteis para o usuário.

Riscos:

- EDGAR e COT ainda ficam incompletos.
- Algumas seções podem começar como “indicadores parciais”.

Recomendação: **melhor próximo passo**.

### Opção B — Finalizar hardening EDGAR/COT antes do frontend

Foco:

- Completar ingestões pendentes antes de construir UI.

Vantagens:

- Base de dados mais completa.
- Recomendation engine pode ganhar sinais de insider/crowding.

Riscos:

- O produto segue sem forma visual.
- Pode consumir tempo em parsing/edge cases de dados externos.

Recomendação: fazer depois do primeiro dashboard visual, salvo se o objetivo imediato for qualidade de dados.

### Opção C — Refatorar arquitetura antes de UI

Foco:

- Criar APIs QI mais tipadas e contratos internos antes da tela.

Vantagens:

- Base mais limpa para produto.
- Menos dívida técnica no frontend.

Riscos:

- Menos resultado visível.
- Pode virar refactor sem validação de UX.

Recomendação: fazer parcialmente dentro do Milestone 1, apenas o necessário.

---

## 7. Milestones Propostos

### Milestone 1 — Dashboard QI em `/mercado`

Objetivo:

Transformar `/mercado` em uma página visual de inteligência de mercado.

Entregas:

- Header com data da última análise.
- Card de regime macro:
  - label do regime.
  - confidence / composite score.
  - breve explicação.
- Card de risco / stress:
  - VIX.
  - yield curve.
  - spreads de crédito, se disponíveis.
- Gráfico de barras de setores:
  - eixo X: setores.
  - eixo Y: score.
  - ordenado por rank.
- Tabela de recomendações:
  - ticker.
  - ação (`BUY`, `HOLD`, `AVOID`).
  - setor.
  - conviction score.
  - rationale curto.
- Gráfico de linha macro:
  - yield spread 10Y-2Y.
  - VIX.
  - inflação / CPI YoY, se calculado.
- Indicador COT:
  - GOLD.
  - COPPER.
  - EUR/USD.

Arquivos prováveis:

- `app/(dashboard)/mercado/page.tsx`
- `components/qi/RegimeCard.tsx`
- `components/qi/SectorScoreChart.tsx`
- `components/qi/RecommendationTable.tsx`
- `components/qi/MacroLineChart.tsx`
- `components/qi/CotPositionCard.tsx`
- `app/api/qi/macro-chart/route.ts`
- `app/api/qi/cot/route.ts`

Dependências:

- Instalar biblioteca de gráficos:
  - opção principal: `recharts`
  - alternativa: `visx`
  - alternativa leve: `lightweight-charts`

Critério de aceite:

- `/mercado` deixa de ser texto plano.
- Usuário consegue entender:
  - regime atual.
  - setores favorecidos.
  - principais recomendações.
  - sinais macro que sustentam a tese.
- Página funciona com dados reais do banco.
- `npm run lint` e `npm run build` passam.

### Milestone 2 — Página Portfólio QI

Objetivo:

Criar uma página para visualizar alocação sugerida e composição recomendada.

Entregas:

- Página `/portfolio` ou expandir `/mercado` com aba de portfólio.
- Gráfico de pizza por setor.
- Tabela de ativos recomendados.
- Breakdown do conviction score:
  - sector alignment.
  - price momentum.
  - fundamental quality.
  - anti-crowding.
- Comparativo com benchmark (`SPY` ou `ACWI`).

Critério de aceite:

- Usuário entende “o que comprar/manter/evitar” e “por quê”.

### Milestone 3 — Integração com Planejamento Pessoal

Objetivo:

Conectar inteligência de mercado com objetivos financeiros do usuário.

Entregas:

- Widget de regime na home.
- Projeção de metas com taxa de retorno sensível ao regime.
- Alerta de risco quando regime piorar.
- Evolução patrimonial.

Critério de aceite:

- Produto deixa de ser apenas “dashboard de mercado” e vira planejamento financeiro inteligente.

### Milestone 4 — Hardening EDGAR/COT

Objetivo:

Completar ingestões pendentes.

Entregas:

- EDGAR Form 4 com transações.
- EDGAR 13F com holdings.
- COT com pelo menos 7 mercados.
- Crowding score por ativo.
- Integração do crowding no recommendation engine.

Critério de aceite:

- Dados de insider e fundos aparecem no banco.
- Recomendações usam crowding real.

### Milestone 5 — Scheduler em Produção

Objetivo:

Automatizar atualização diária.

Entregas:

- Deploy do container Python em Railway/Fly/VM.
- Scheduler diário:
  - ingest.
  - universe.
  - analysis.
- Painel de saúde do pipeline.
- Alertas de falha.

Critério de aceite:

- Sistema atualiza sozinho diariamente.
- Último status visível no frontend.

### Milestone 6 — Produto Avançado

Objetivo:

Aproximar de produto final.

Entregas:

- Backtesting visual.
- Multi-portfólio.
- Alertas personalizados.
- Relatório PDF mensal.
- PWA / mobile.

---

## 8. Decisões que Precisam Ser Tomadas

### 8.1 Qual biblioteca de gráficos usar?

Opções:

- `recharts`
  - Mais simples.
  - Boa integração com React.
  - Suficiente para dashboard MVP.
- `visx`
  - Mais flexível.
  - Mais trabalho.
- `lightweight-charts`
  - Ótima para séries financeiras.
  - Menos flexível para dashboard geral.

Sugestão inicial:

- Usar `recharts` no Milestone 1.
- Reavaliar se precisar de gráficos financeiros mais sofisticados.

### 8.2 Criar APIs específicas ou consultar Prisma direto em Server Components?

Opção 1: Prisma direto em `page.tsx`

- Mais simples.
- Menos boilerplate.
- Bom para MVP.

Opção 2: APIs `/api/qi/*`

- Melhor separação.
- Facilita reuso por mobile/app futuro.
- Melhora contrato de dados.

Sugestão:

- Para dados já existentes simples, Prisma direto pode bastar.
- Para séries temporais e gráficos, criar APIs específicas:
  - `/api/qi/macro-chart`
  - `/api/qi/cot`
  - `/api/qi/asset/:symbol`

### 8.3 Como modelar recommendation payload no frontend?

O payload atual é JSON flexível.

Decisão:

- Manter flexível por enquanto.
- Criar types TypeScript locais para leitura.
- Não migrar schema ainda.

Sugestão:

- Criar `lib/qi/types.ts`.

### 8.4 Qual página vira “centro do produto”?

Opções:

- `/mercado`: visão macro e QI geral.
- `/portfolio`: visão de alocação e recomendações.
- Home dashboard: visão consolidada.

Sugestão:

1. Começar com `/mercado`.
2. Depois criar `/portfolio`.
3. Por fim integrar widgets na home.

### 8.5 Continuar hardening EDGAR agora ou depois?

Sugestão:

- Depois do primeiro dashboard visual.
- O produto já tem dados suficientes para uma boa tela inicial.
- EDGAR pode virar uma iteração específica.

---

## 9. Sugestão de Sequência de Implementação Imediata

### Sprint 1 — Visualizar dados existentes

1. Instalar `recharts`.
2. Criar tipos QI em `lib/qi/types.ts`.
3. Criar componentes:
   - `RegimeCard`
   - `SectorScoreChart`
   - `RecommendationTable`
   - `CotPositionCard`
4. Refatorar `/mercado`.
5. Rodar `npm run lint`.
6. Rodar `npm run build`.

### Sprint 2 — Séries temporais

1. Criar `/api/qi/macro-chart`.
2. Criar transformação para:
   - DGS10.
   - DGS2.
   - yield spread.
   - VIX.
   - CPI YoY.
3. Adicionar `MacroLineChart`.
4. Adicionar seletor de janela:
   - 3M.
   - 6M.
   - 1Y.
   - 5Y.

### Sprint 3 — Portfolio visual

1. Criar página `/portfolio`.
2. Ler última recomendação.
3. Montar alocação por setor.
4. Criar gráfico de pizza.
5. Criar breakdown por ativo.

### Sprint 4 — Pipeline health

1. Criar API `/api/qi/jobs`.
2. Mostrar último status por job.
3. Mostrar alerta se algum job falhou.
4. Mostrar data da última atualização.

---

## 10. Perguntas Para Discutir com Claude

1. Devemos priorizar dashboard visual agora ou terminar EDGAR/COT antes?
2. Para o MVP, `recharts` é a melhor escolha?
3. Faz sentido criar APIs específicas para gráficos ou usar Prisma direto no Server Component?
4. A página principal do QI deve ser `/mercado` ou uma nova `/portfolio`?
5. O payload de `qi_recommendation` deve continuar flexível ou virar schema relacional?
6. Como apresentar recomendações sem parecer assessoria regulada?
7. Como explicar regime macro para usuário leigo?
8. Quais indicadores devem entrar no primeiro dashboard?
9. Devemos ter “confidence score” visível ao usuário?
10. Como conectar metas pessoais ao regime macro sem prometer retorno?

---

## 11. Prompt Sugerido Para Claude

Use este prompt na conversa com Claude:

```md
Estou construindo o projeto Financial Advisor.

Stack:
- Next.js 16 App Router
- React 19
- TypeScript
- Prisma 6
- PostgreSQL/Neon
- Auth.js
- Python em analytics/qi para pipeline quantitativo

O backend quantitativo já está implementado:
- 667 ativos em qi_asset
- 1.079.097 preços OHLCV em qi_market_price_daily
- 36 séries macro em qi_macro_series
- 22.722 pontos FRED em qi_macro_series_point
- 15 recomendações em qi_recommendation
- regime macro calculado: US=EXPANSION, EU/JP/EM=INFLATION
- ranking setorial pronto em qi_sector_score_snapshot

O frontend atual tem uma página /mercado, mas ainda é texto plano.
Quero transformar isso em um dashboard de produto final, com gráficos, indicadores e recomendações claras.

Tenho dúvida sobre a melhor sequência:
1. Criar primeiro dashboard visual em /mercado usando os dados existentes.
2. Antes disso, finalizar hardening EDGAR/COT.
3. Ou refatorar APIs/tipos antes da UI.

Quero uma avaliação de arquitetura e produto:
- Qual melhor milestone inicial?
- Quais componentes criar?
- Quais APIs criar?
- Qual biblioteca de gráficos usar?
- Como modelar o payload de recommendation no TypeScript?
- Como evitar que a UI pareça assessoria regulada?
- Como organizar /mercado vs /portfolio vs home dashboard?

Me proponha uma estratégia de implementação incremental, com trade-offs, arquivos a tocar e critérios de aceite.
```

---

## 12. Recomendação Inicial

Minha recomendação é iniciar pelo **Milestone 1 — Dashboard QI em `/mercado`**.

Motivos:

- Os dados principais já existem.
- É o menor esforço com maior impacto visual.
- Ajuda a validar o produto antes de investir mais em parsing EDGAR.
- Dá forma para o usuário entender o valor do motor QI.
- Cria base de componentes para `/portfolio` e home.

Ordem sugerida:

1. Dashboard `/mercado`.
2. Página `/portfolio`.
3. Integração com planejamento pessoal.
4. Hardening EDGAR/COT.
5. Scheduler em produção.

---

## 13. Critério Para Considerar o Produto “MVP Visual”

O MVP visual pode ser considerado pronto quando:

- `/mercado` mostra regime atual com explicação.
- Usuário vê ranking setorial em gráfico.
- Usuário vê recomendações com rationale.
- Usuário vê pelo menos um gráfico macro temporal.
- Usuário vê a data da última análise.
- Usuário entende que aquilo é suporte educacional, não recomendação regulada.
- Build e lint passam.

---

## 14. Arquivos de Referência

Principais arquivos atuais:

- `app/(dashboard)/mercado/page.tsx`
- `app/api/qi/regime/route.ts`
- `app/api/qi/sectors/route.ts`
- `app/api/qi/recommendation/route.ts`
- `app/api/qi/portfolio/route.ts`
- `analytics/qi/jobs/run_ingest_daily.py`
- `analytics/qi/jobs/run_analysis_daily.py`
- `analytics/qi/analysis/regime_engine.py`
- `analytics/qi/analysis/sector_rotation.py`
- `analytics/qi/analysis/recommendation_engine.py`
- `analytics/qi/ingest/cftc_client.py`
- `analytics/qi/ingest/edgar_insider_client.py`
- `analytics/qi/ingest/edgar_13f_client.py`
- `prisma/schema.prisma`
- `CLAUDE.md`

---

## 15. Observação Final

O projeto já passou da fase de infraestrutura inicial.

O ponto atual não é mais “conseguir dados”; o ponto agora é **dar forma de produto**:

- clareza visual;
- narrativa simples;
- confiança;
- indicadores úteis;
- explicação transparente;
- integração com o planejamento financeiro pessoal.

O próximo milestone deve ser escolhido pensando menos em completar todas as fontes de dados e mais em transformar o que já existe em uma experiência compreensível para o usuário final.
