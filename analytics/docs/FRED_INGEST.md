# Ingestão FRED — referência

Este documento descreve **o que o job Python grava** nas tabelas `qi_macro_*`, os **modos de universo** (manifest vs catálogo completo), variáveis de ambiente e **como gerar um relatório** do que já foi ingerido.

**Ver também:** [FRED_MACRO_EXPANSION.md](./FRED_MACRO_EXPANSION.md) — core vs sandbox, modo `full` controlado, promoção para produção, métricas e riscos.

## Destino dos dados (Prisma / SQLAlchemy)

| Tabela | Conteúdo |
|--------|----------|
| `qi_macro_series` | Uma linha por série FRED: `provider = 'FRED'`, `external_id` = ID da série (ex. `DGS10`), metadados (`title`, `frequency`, `units`, `seasonal_adjustment`), `last_successful_run_at`. |
| `qi_macro_series_point` | Observações: `observed_on` (data), `value`, `raw` (JSON com data/valor brutos da API). |

Constraint útil: `@@unique([provider, externalId])` em `qi_macro_series` — não duplica a mesma série FRED.

## Modos de ingestão

### 1. `QI_FRED_UNIVERSE=manifest` (padrão)

- Lista de séries fixa num JSON em `analytics/qi/data/`, por defeito [`../qi/data/macro_series.json`](../qi/data/macro_series.json) (`external_id` + `title`; campos extra como `tier`/`category` são ignorados).
- Outro ficheiro: `QI_FRED_MANIFEST=macro_series_sandbox.json` (camada exploratória — ver [FRED_MACRO_EXPANSION.md](./FRED_MACRO_EXPANSION.md)).
- Ideal para **produção enxuta**: só as variáveis que os motores/analytics usam.

### 2. `QI_FRED_UNIVERSE=full`

- **Descoberta**: percorre a árvore de **categorias** da API FRED (raiz configurável), junta todas as séries listadas em cada categoria e **deduplica** por `series_id`.
- **Primeira execução** com zero séries FRED na BD: corre a descoberta automaticamente.
- **Execuções seguintes**: por defeito só **atualiza** séries que já existem em `qi_macro_series`. Para **incorporar séries novas** no catálogo FRED: `QI_FRED_DISCOVER=1` (ou `true`).
- Recomenda-se `QI_FRED_MAX_SERIES` no MVP para não abrir um backfill de dias em séries enormes.

## Variáveis de ambiente (resumo)

| Variável | Descrição |
|----------|-----------|
| `FRED_API_KEY` | Obrigatória para o ingest FRED. |
| `QI_FRED_UNIVERSE` | `manifest` \| `full`. |
| `QI_FRED_CATEGORY_ROOT` | ID da categoria FRED (default `0` = raiz). |
| `QI_FRED_MAX_SERIES` | Teto na **descoberta** (opcional; recomendado em `full`). |
| `QI_FRED_DISCOVER` | `1` / `true` — força nova descoberta (novas séries). |
| `QI_FRED_BACKFILL_START` | Data inicial das observações (default `2019-01-01`). |
| `QI_FRED_REQUEST_DELAY_SEC` | Pausa entre chamadas (descoberta + ingest `full`). |
| `QI_MIN_FRED_PCT` | Gate para Polygon: % de séries FRED com ≥1 ponto; com `full` usar `0` até o backfill avançar. |
| `QI_INGEST_PHASE` | `all` \| `fred` \| `polygon` \| `fmp`. |

Lista completa e defaults: [`../README.md`](../README.md).

## Cobertura e log

O job imprime uma linha do tipo:

```text
>>> FRED_COBERTURA=<pct>% (<ok>/<tot> séries com dados) | mínimo exigido=<QI_MIN_FRED_PCT>% | Polygon liberado: SIM|NÃO
```

- **Manifest**: `tot` = número de entradas em `macro_series.json`; `ok` = dessas que têm ≥1 ponto na BD.
- **Full**: `tot` = linhas `qi_macro_series` com `provider = FRED`; `ok` = dessas com ≥1 ponto.

## Relatório do que está ingerido

Para **documentar o estado atual** da BD ( contagens, intervalo de datas por série, última corrida):

```bash
cd analytics
export PYTHONPATH="$PWD"
python3 -m qi.jobs.export_fred_catalog -o report/fred_catalog.md
```

Sem `-o`, o Markdown vai para **stdout**. Variável opcional: `QI_FRED_EXPORT_MAX_ROWS` — limita quantas séries listar na tabela (útil em catálogos muito grandes; o cabeçalho com totais mantém-se completo).

## Consultas SQL úteis (Neon / psql)

Totais:

```sql
SELECT COUNT(*) AS series_fred
FROM qi_macro_series
WHERE provider = 'FRED';

SELECT COUNT(*) AS pontos_fred
FROM qi_macro_series_point p
JOIN qi_macro_series s ON s.id = p.series_id
WHERE s.provider = 'FRED';
```

Intervalo global de datas:

```sql
SELECT MIN(observed_on) AS min_d, MAX(observed_on) AS max_d
FROM qi_macro_series_point p
JOIN qi_macro_series s ON s.id = p.series_id
WHERE s.provider = 'FRED';
```

## Relação com o dual-write Next.js

O ingest legado em TypeScript pode ainda escrever `MarketSeries` / `MarketObservation`. O pipeline quantitativo usa **`qi_*`**. Ver [FRED_STRATEGY.md](./FRED_STRATEGY.md).

## API FRED utilizada

- `fred/series/observations` — valores históricos.
- `fred/series` — metadados por série.
- `fred/category/children` e `fred/category/series` — apenas no modo `full` (descoberta do catálogo).

Implementação: [`../qi/ingest/fred_client.py`](../qi/ingest/fred_client.py), job diário: [`../qi/jobs/run_ingest_daily.py`](../qi/jobs/run_ingest_daily.py).

---

## Resultados possíveis (para análise: ingerir ou não)

Esta secção lista **todos os desfechos** observáveis — consola, `qi_ingestion_job` e `qi_macro_*` — para poderes comparar cenários antes de aumentar o universo FRED, custo de API, ou armazenamento.

### 1. O job FRED nem corre

| Condição | Mensagem típica (stdout) | Efeito na BD |
|----------|---------------------------|--------------|
| `QI_INGEST_PHASE` ≠ `fred` e ≠ `all` (ex. só `polygon`) | *(nenhuma linha `FRED:`)* | Nada alterado pelo bloco FRED. |
| `QI_INGEST_PHASE` inclui `fred` mas `FRED_API_KEY` ausente | `Skip FRED (FRED_API_KEY unset).` | Nenhum `qi_ingestion_job` FRED nesta execução. |

**Interpretação:** Sem chave não há dados novos; a cobertura impressa a seguir reflecte apenas o estado **já** existente.

---

### 2. Job FRED corre — resultado global

| Resultado | Consola | `qi_ingestion_job` (`source=FRED`, `job_name=macro_observations`) |
|-----------|---------|-------------------------------------------------------------------|
| **Sucesso** | `FRED: upserted <n> new macro points.` | `status=SUCCESS`, `rows_upserted=<n>`, `error_message` vazio. `<n>` = linhas **novas** em `qi_macro_series_point` (inserções que não eram duplicata de `(series_id, observed_on)`). |
| **Falha (excepção)** | `FRED failed: ...` + stack trace | `status=FAILED`, `error_message` truncado (~2000 chars), `rows_upserted` pode ser `NULL`. |

**Nota:** `rows_upserted` **não** conta séries criadas nem actualizações de metadados; só pontos novos. Um dia em que tudo já estava sincronizado pode dar `<n>=0` com `SUCCESS`.

---

### 3. Universo vazio (nada a processar)

| Modo | Quando acontece | `FRED: upserted` | Cobertura `FRED_COBERTURA` |
|------|-----------------|------------------|----------------------------|
| **manifest** | `macro_series.json` inexistente, vazio, ou ingest não corre | `0` | `0/0` ou `0%` com `tot` conforme ficheiro |
| **full** | Descoberta devolve 0 séries (erro de API / árvore vazia) | `0` | Depende do que já existia na BD |

---

### 4. Modo `manifest` — por série (lógica interna)

Para cada entrada em `macro_series.json`:

| Resultado | Comportamento |
|-----------|----------------|
| Metadados OK | `fred/series` preenche `title`, `frequency`, `units`, `seasonal_adjustment` em `qi_macro_series`. |
| Metadados falham (HTTP/erro) | Excepção **não** aborta o job; `meta={}` e a linha em `qi_macro_series` ainda é garantida com título do manifest (se existir). |
| Observações OK | Pontos inseridos; valores `.` ou vazios na API são **ignorados** (não criam linha em `qi_macro_series_point`). |
| Observações falham | Lista vazia tratada; série pode ficar **sem pontos** mas com linha em `qi_macro_series`. |
| Já sincronizado até hoje | `observation_start` = dia após o último `observed_on`; pode resultar em **0 pontos novos** para essa série. |

**Séries no manifest sem linha em `qi_macro_series`:** só ocorre se o ingest nunca correu para essa série ou falhou antes do flush; na prática a primeira passagem cria a série.

---

### 5. Modo `full` — descoberta

| Evento | Mensagem / comportamento |
|--------|---------------------------|
| Primeira corrida ou `QI_FRED_DISCOVER=1` | `FRED full: descoberta (root=..., max=...)` |
| Sem `QI_FRED_MAX_SERIES` na descoberta | `FRED full: AVISO — sem QI_FRED_MAX_SERIES...` |
| Durante a árvore | `FRED discovery: ... categorias visitadas...` e/ou `... N séries únicas…` |
| Fim da descoberta | `FRED full: <k> séries únicas no catálogo.` |
| Erro ao listar filhos de uma categoria | Categoria ignorada (lista vazia). |
| Erro ao listar séries de uma categoria | Categoria ignorada (`continue`). |
| Teto `QI_FRED_MAX_SERIES` atingido | Catálogo truncado a esse número (ordenação por `external_id`). |

**Interpretação:** séries “em falta” na descoberta por erro HTTP podem ser **menos** do que o FRED expõe na árvore; comparar com o site FRED se precisares de completude absoluta.

---

### 6. Modo `full` — ingestão incremental (sem nova descoberta)

| Estado da BD | O que o job processa |
|----------------|----------------------|
| Já existem linhas `FRED` | **Todas** as `external_id` em `qi_macro_series` (provider FRED), ordenadas. |
| Queres acrescentar séries novas sem apagar a BD | `QI_FRED_DISCOVER=1` na próxima execução. |

---

### 7. Linha `FRED_COBERTURA` e gate Polygon

Saída:

```text
>>> FRED_COBERTURA=<pct>% (<ok>/<tot> séries com dados) | mínimo exigido=<QI_MIN_FRED_PCT>% | Polygon liberado: SIM|NÃO
```

| `tot` | `ok` | `pct` | `Polygon liberado` (regra padrão `QI_MIN_FRED_PCT>0`) |
|-------|------|-------|--------------------------------------------------------|
| **manifest** | N entradas no JSON | séries manifest com ≥1 ponto | `SIM` se `pct >= QI_MIN_FRED_PCT` |
| **full** | linhas FRED em `qi_macro_series` | dessas com ≥1 ponto | Idem; com dezenas de milhar de séries, `pct=100` é **raro** até tudo estar estável |

Casos extremos:

| Cenário | `ok/tot` | Leitura |
|---------|----------|---------|
| `0/0` | 0% | Sem manifest válido **ou** (full) sem séries FRED na BD. |
| `ok=tot` | 100% | Todas as séries contabilizadas têm pelo menos um ponto. |
| `ok<tot` | <100% | Algumas séries sem dados (falha API, série descontinuada só com `.`, ou ainda não backfilled). |

Se `QI_MIN_FRED_PCT=0`, o gate **sempre** passa (excepto se a lógica não usar o mínimo — no código, `<=0` libera).

**Dica automática** (só texto): com `full`, `tot_n>200` e `QI_MIN_FRED_PCT>=99` aparece a sugestão de usar `QI_MIN_FRED_PCT=0` até o backfill avançar.

**Polygon bloqueado pelo gate:**

```text
>>> Polygon: pulado — aumente a cobertura FRED ou defina QI_MIN_FRED_PCT=0 para forçar.
```

---

### 8. Estados por linha em `qi_macro_series` / pontos

| Estado | Como detetar (SQL ou export) |
|--------|------------------------------|
| Série registada, **0 pontos** | `LEFT JOIN`…`COUNT(p)=0` ou relatório com coluna Pontos = 0. |
| Série com pontos, intervalo **curto** | `MIN`/`MAX` em `qi_macro_series_point` — comparar com `QI_FRED_BACKFILL_START`. |
| `last_successful_run_at` recente | Job completou essa série na última passagem (metadados + tentativa de obs). |
| Pontos duplicados por data | Impedido por `@@unique([seriesId, observedOn])` — re-ingest é idempotente. |

---

### 9. API FRED — respostas que influenciam dados

| Situação | Efeito no código actual |
|----------|-------------------------|
| HTTP 4xx/5xx em `series/observations` | Tratado como lista vazia de observações (série pode ficar sem pontos novos). |
| HTTP 4xx/5xx em `series` (metadados) | `meta` vazio; ingest continua. |
| Rate limit / throttling | Pode manifestar-se como falhas intermitentes; `QI_FRED_REQUEST_DELAY_SEC` reduz risco. |
| Valores ausentes (`.`) | Não entram como `float`; não ocupam linha em `qi_macro_series_point`. |

*(Comportamento exacto depende da versão do cliente; para política de retry futura, ver issues internas.)*

---

### 10. Relatório `export_fred_catalog` — como usar para decidir

| Campo no Markdown | Pergunta que suporta |
|--------------------|----------------------|
| Séries FRED vs com ≥1 ponto | Há “falhas silenciosas” (séries sem dados)? |
| Pontos totais | Ordem de grandeza de armazenamento e custo incremental. |
| Min / max data global | Alinhamento com a janela analítica desejada. |
| Por série: Pontos, Min/Max data | Vale a pena manter séries com muito poucos pontos ou janela estranha? |
| Última ingestão | Série deixou de actualizar? |

Truncagem `QI_FRED_EXPORT_MAX_ROWS`: o resumo global mantém-se; a **tabela** lista só as primeiras N linhas — não confundir com “só N séries existem”.

---

### 11. Checklist para “devo alargar o ingest FRED?”

1. **Objectivo:** motores usam poucas séries (manifest) vs exploração massiva (`full`).
2. **Cobertura actual:** `FRED_COBERTURA` + export — proporção sem pontos.
3. **Custo / tempo:** descoberta + 1ª carga com `full` pode ser longa; API FRED tem limites por chave.
4. **Armazenamento:** `COUNT(*)` em `qi_macro_series_point` e crescimento por dia.
5. **Downstream:** `QI_MIN_FRED_PCT` e dependência Polygon — aceitas `0` temporariamente?
6. **Manutenção:** `full` sem `QI_FRED_DISCOVER` não puxa séries novas do catálogo FRED até voltares a descobrir.

---

### 12. Consultas extra para auditoria

Séries sem pontos (candidatas a remoção ou re-tentativa):

```sql
SELECT s.external_id, s.title, s.last_successful_run_at
FROM qi_macro_series s
LEFT JOIN qi_macro_series_point p ON p.series_id = s.id
WHERE s.provider = 'FRED'
GROUP BY s.id
HAVING COUNT(p.id) = 0
ORDER BY s.external_id;
```

Últimos jobs FRED:

```sql
SELECT id, status, job_name, rows_upserted,
       started_at, finished_at, LEFT(error_message, 200) AS err
FROM qi_ingestion_job
WHERE source = 'FRED'
ORDER BY started_at DESC
LIMIT 20;
```

---

### 13. Outras mensagens no mesmo `run_ingest_daily` (contexto)

Não são exclusivas do FRED, mas aparecem na mesma corrida e podem confundir o diagnóstico:

| Mensagem | Significado |
|----------|-------------|
| `Seeded <n> assets from CSV.` | `seed_assets_if_empty` correu; independente do resultado FRED. |
| `Skip Polygon (POLYGON_API_KEY unset).` | Polygon não configurado. |
| `Polygon: wrote <n> daily bars...` / `Polygon failed:` | Resultado da fase Polygon (após o gate FRED). |
| `Skip FMP...` / `FMP: upserted...` | Fase FMP. |

---

### 14. Variáveis de ambiente mal definidas

| Situação | Comportamento típico |
|----------|----------------------|
| `QI_FRED_UNIVERSE` diferente de `manifest` / `full` | Tratado como **não** `full` (comparação exacta); efectivamente **manifest** se o valor não for `full`. |
| `QI_FRED_CATEGORY_ROOT` inválido | Erro ao fazer `int(...)` ao arrancar o job. |
| `QI_MIN_FRED_PCT` não numérico | Erro ao fazer `float(...)` ao arrancar. |

Confirma os valores com `echo $QI_FRED_UNIVERSE` antes de cron em produção.
