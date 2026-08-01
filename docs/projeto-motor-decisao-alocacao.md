# Projeto — Motor de Decisão de Alocação

## Score composto

Para cada indicador `i` na aba:

1. Obter valor atual `x_i` (último dado disponível).
2. Calcular z-score sobre janela `W` (default 252 dias):

   `z_i = (x_i - mean(x)) / std(x)`

3. Ajustar direção: se `direcao=negativa`, usar `-z_i`.
4. Contribuição ponderada por camada:

   `c_i = z_i * peso_i * peso_camada[camada_i]`

5. Score composto:

   `S = sum(c_i) / sum(peso_i * peso_camada)` (normalizado)

Persistir em `scores_historico` com `componentes_json` detalhando cada `c_i`.

## Score por ativo (granularidade)

Para tickers em `universo`:

- 6 indicadores técnicos genéricos (z-scores)
- Indicadores yfinance/EDGAR específicos do papel
- `S_ativo` com mesma fórmula
- Comparar estágio do ativo vs `S` agregado da aba

## Estágio do ciclo (sec. 6.3)

Regressão linear de `S` ao longo de `regressao_dias` (default 90):

| Condição | Estágio |
|----------|---------|
| slope > `limiar_ascendente` | Ascendente |
| slope < `limiar_descendente` | Descendente |
| entre limiares | Maduro |

Indicador dominante = maior `|c_i|` no cálculo atual.

## Schema SQLite — `scores_historico`

```sql
CREATE TABLE scores_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aba_id TEXT NOT NULL,
  data DATE NOT NULL,
  score_composto REAL NOT NULL,
  estagio TEXT,
  slope REAL,
  componentes_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(aba_id, data)
);
```

## Schema — `scores_ativo`

```sql
CREATE TABLE scores_ativo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aba_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  data DATE NOT NULL,
  score_composto REAL NOT NULL,
  estagio TEXT,
  diverge_categoria INTEGER DEFAULT 0,
  componentes_json TEXT NOT NULL,
  UNIQUE(aba_id, ticker, data)
);
```

## Formato relatório (sec. 8)

```markdown
# Relatório — {nome_aba} — {data}

## Resumo
- Score composto S: {S}
- Estágio: {estagio} (slope={slope})
- Indicador dominante: {id} ({contribuicao})

## Racional matemático

| Indicador | Valor | z-score | Peso | Contribuição |
|-----------|-------|---------|------|--------------|

## Universo (ativos)
| Ticker | S | Estágio | vs Categoria |
...

---
*Informação educacional. Não constitui assessoria de investimento.*
```

## Contribuição de risco (roadmap)

Após MVP: normalizar `S` por volatilidade realizada do benchmark da classe.
