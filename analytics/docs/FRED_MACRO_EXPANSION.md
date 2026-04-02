# FRED macro expansion — core, sandbox, full mode, promotion & observability

Este documento alinha a estratégia **quant/macro** com o código: manifest de produção, camada **sandbox** exploratória, uso controlado de `QI_FRED_UNIVERSE=full`, promoção para produção e métricas de saúde.

## 1. Core (produção) — `macro_series.json`

- **Ficheiro:** [`../qi/data/macro_series.json`](../qi/data/macro_series.json)
- **Contagem:** 27 séries (alvo ~20–30), alta razão sinal/ruído para o pipeline diário e motores (ex. `macro_regime` usa `VIXCLS`, `NFCI`, `T10Y2Y` — todas incluídas).
- **Grupos cobertos:**
  - **Atividade:** `GDPC1`, `INDPRO`, `RSAFS`, `TCU`
  - **Inflação:** `CPIAUCSL`, `CPILFESL`, `PCEPI`, `PCEPILFE`, `T5YIE`, `T10YIE`
  - **Taxas / curva:** `FEDFUNDS`, `SOFR`, `DGS2`, `DGS10`, `DGS30`, `T10Y2Y`, `MORTGAGE30US`
  - **Trabalho:** `UNRATE`, `PAYEMS`, `ICSA`, `JTSJOL`
  - **Consumo / confiança:** `PCE`, `UMCSENT`, `USACSCICP02STSAM` (índice OECD de confiança do consumidor EUA; não há ID FRED estável para o índice da Conference Board com o mesmo nome)
  - **Condições financeiras / FX:** `VIXCLS`, `NFCI`, `DEXUSEU`

**Produção:** manter `QI_FRED_MANIFEST` por defeito (ou omitido) → `macro_series.json`.

---

## 2. Sandbox (avançado) — `macro_series_sandbox.json`

- **Ficheiro:** [`../qi/data/macro_series_sandbox.json`](../qi/data/macro_series_sandbox.json)
- **Contagem:** 56 séries `tier: "advanced"` com `category` (crédito & liquidez, habitação, leading, trabalho, stress, curva, inflação alternativa, externo, equity/commodities).
- **Não** está no cron de produção por defeito; usa-se em jobs dedicados ou staging.

**Ingerir sandbox (mesmo formato que o manifest; campos extra `tier` / `category` são ignorados pelo ingest):**

```bash
export QI_FRED_MANIFEST=macro_series_sandbox.json
export QI_MIN_FRED_PCT=0
export PYTHONPATH="$(pwd)/analytics"
python3 -m qi.jobs.run_ingest_daily
```

**Nota:** séries já presentes no core partilham `external_id` com nada no sandbox (lista **sem** overlap) para evitar duplicar trabalho na análise; a BD continua idempotente se houver overlap futuro.

---

## 3. Modo `full` controlado (descoberta)

Objetivo: descobrir candidatos **fora** dos JSONs, medir cobertura, tempo e volume — **sem** substituir o manifest de produção.

**Parâmetros recomendados:**

| Variável | Valor sugerido | Motivo |
|----------|------------------|--------|
| `QI_FRED_UNIVERSE` | `full` | Árvore de categorias FRED |
| `QI_FRED_DISCOVER` | `1` | Nova passagem de descoberta |
| `QI_FRED_MAX_SERIES` | `200`–`500` | Teto explícito; evita explosão de séries/pontos |
| `QI_MIN_FRED_PCT` | `0` | Gate Polygon não bloqueia enquanto cobertura % do catálogo completo é parcial |
| `QI_FRED_REQUEST_DELAY_SEC` | `0.55` (default) | Respeitar limites da API |
| `QI_FRED_BACKFILL_START` | Alinhar com janela de backtest | História comparável entre séries |

**Medir:**

- **Cobertura:** linha `FRED_COBERTURA` no log (`ok/tot` no modo full).
- **Armazenamento:** `COUNT(*)` em `qi_macro_series_point` antes/depois (ver SQL em [FRED_INGEST.md](./FRED_INGEST.md)).
- **Tempo:** duração wall-clock do processo; escalar `QI_FRED_MAX_SERIES` em passos (200 → 400).

**Promoção de candidatos:** comparar séries descobertas com o sandbox e com o core; só promover com o quadro da secção 4.

---

## 4. Promoção para o manifest de produção

### Regras mínimas (todas relevantes)

Uma série só entra em [`macro_series.json`](../qi/data/macro_series.json) se:

1. **Dados consistentes:** proporção aceitável de datas sem valor (na API, `.`); frequência estável; sem saltos inexplicáveis não tratados pelo modelo.
2. **Histórico suficiente:** primeira observação ≤ data alvo derivada de `QI_FRED_BACKFILL_START` (ou justificação para janela mais curta).
3. **Razão económica:** identidade clara (não redundante com outra série já no core salvo se o sinal for ortogonal).
4. **Valor analítico:** melhora pelo menos um entre: modelo quant, dashboard, narrativa macro institucional.

### Pontuação sugerida (0–3 cada; promover se **≥ 8** e sem falha crítica)

| Critério | 0 | 1 | 2 | 3 |
|----------|---|---|---|---|
| **Completude** | Muitos buracos | Alguns buracos | Poucos | Quase completo na janela |
| **Sobreposição** | Duplicata de outra série | Correlação muito alta | Complementar | Ortogonal ao core |
| **Uso** | Nenhum planeado | Exploração | Um consumidor definido | Vários ou motor crítico |
| **Manutenção** | Metadados pobres / descontinuada | Revisão frequente | Estável | Série standard FRED |

**Governança:** alterações ao `macro_series.json` via PR/review; manter `macro_series_sandbox.json` como “laboratório”.

---

## 5. Observabilidade e relatórios

### Métricas

| Métrica | Definição | Onde |
|---------|-----------|------|
| Cobertura % | Séries com ≥1 ponto / universo (manifest ou full) | Log `FRED_COBERTURA` |
| Séries sem pontos | `qi_macro_series` FRED sem linhas em `qi_macro_series_point` | SQL abaixo |
| Frescura | `last_successful_run_at` por série | `export_fred_catalog` / SQL |
| Crescimento de pontos | `COUNT(*)` em `qi_macro_series_point` ao longo do tempo | Snapshots manuais ou tabela de métricas |

### SQL (monitorização)

**% global (modo full — séries na BD com dados):**

```sql
SELECT
  COUNT(*) FILTER (WHERE pt.c > 0) * 100.0 / NULLIF(COUNT(*), 0) AS pct_with_points
FROM qi_macro_series s
LEFT JOIN (
  SELECT series_id, COUNT(*) AS c FROM qi_macro_series_point GROUP BY series_id
) pt ON pt.series_id = s.id
WHERE s.provider = 'FRED';
```

**Séries sem observações:**

```sql
SELECT s.external_id, s.title, s.last_successful_run_at
FROM qi_macro_series s
LEFT JOIN qi_macro_series_point p ON p.series_id = s.id
WHERE s.provider = 'FRED'
GROUP BY s.id
HAVING COUNT(p.id) = 0;
```

**Pontos totais (crescimento):**

```sql
SELECT COUNT(*) AS n_points, CURRENT_DATE AS d
FROM qi_macro_series_point p
JOIN qi_macro_series s ON s.id = p.series_id
WHERE s.provider = 'FRED';
```

### Limiares sugeridos (alertas)

| Sinal | Limiar | Acção |
|-------|--------|--------|
| Cobertura manifest | `< 100%` após retry | Investigar série; API ou ID errado |
| Séries sem pontos | `> 5%` do universo FRED | Revisar falhas de API / séries descontinuadas |
| `last_successful_run_at` | > **7 dias** atrás numa série core | Verificar job / chave / rate limit |
| Crescimento pontos/dia | Queda **> 50%** vs média 30d | Pipeline ou FRED instável |

Ajustar limites ao volume real (dezenas vs dezenas de milhar de séries).

---

## 6. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| **Inflação de dados** | `QI_FRED_MAX_SERIES`; manifest mínimo em produção; não usar `full` no cron diário sem teto |
| **Cobertura baixa no `full`** | `QI_MIN_FRED_PCT=0` durante exploração; não interpretar % como qualidade analítica |
| **Throttling API** | `QI_FRED_REQUEST_DELAY_SEC`; monitorar `qi_ingestion_job` FAILED |
| **Ruído > sinal** | Promoção por score; sandbox separado; revisão periódica do manifest |
| **Séries descontinuadas** | Verificar título FRED “DISCONTINUED”; retirar do manifest ou substituir |

---

## 7. Variáveis — resumo operacional

| Ambiente | Exemplo |
|----------|---------|
| **Produção (core)** | `QI_FRED_UNIVERSE=manifest` (default), `QI_FRED_MANIFEST=macro_series.json` |
| **Sandbox ingest** | `QI_FRED_MANIFEST=macro_series_sandbox.json`, `QI_MIN_FRED_PCT=0` |
| **Descoberta controlada** | `QI_FRED_UNIVERSE=full`, `QI_FRED_DISCOVER=1`, `QI_FRED_MAX_SERIES=400`, `QI_MIN_FRED_PCT=0` |

Documentação relacionada: [FRED_INGEST.md](./FRED_INGEST.md), [README](../README.md).
