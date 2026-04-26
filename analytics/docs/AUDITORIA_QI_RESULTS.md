# Auditoria QI — resultados (execução automática)

Gerado conforme plano sequenciado; base: `financial_advisor` (local).

## Pré-requisito Polygon

- Ativos ativos em `qi_asset`: **656**
- Distinct `asset_id` com `source='POLYGON'`: **601**
- Ativos sem nenhuma barra Polygon (qualquer setor): **55**
- Conclusão: ingest substancialmente completo; gaps residuais tratados na fase Sprint 1 (re-ingest incremental).

## 1.1 Contagens por tabela

| tabela | n |
|--------|---|
| qi_asset | 656 |
| qi_fundamental_snapshot | 0 (antes do FMP) |
| qi_macro_series | 34 |
| qi_macro_series_point | 21092 |
| qi_market_price_daily | 298728 |
| qi_recommendation | 0 |
| qi_regime_snapshot | 0 |
| qi_sector_score_snapshot | 0 |
| qi_universe_member | 0 |

## 1.2 Cobertura Polygon por setor (≥80% meta)

| Setor | % cobertura |
|-------|-------------|
| Information Technology | 100.0 |
| Health Care | 100.0 |
| Utilities | 100.0 |
| Communication Services | 100.0 |
| Materials | 100.0 |
| Energy | 100.0 |
| Industrials | 98.8 |
| Consumer Discretionary | 98.3 |
| Real Estate | 97.2 |
| Financials | 95.3 |
| Consumer Staples | 93.0 |

Todos os setores ≥80%.

## 1.3 Profundidade histórica Polygon

- mais_antiga: 2024-04-08  
- mais_recente: 2026-04-07  
- dias_uteis: 501  
- ativos (distinct): 640  
- total_barras: 318081  
- media_barras_por_ativo: 497  

## 1.4 Amostra ativos sem preço (com GICS, top 20)

Ver query no run — exemplos: ITX, BF.B, KMB, ULVR, APO, BRK.B, CS, ISP, NDAQ, ABB, SBA (lista parcial; total de equity com setor sem Polygon pode ser baixo vs 55 globais).

## 1.5 FMP por setor (antes do ingest FMP)

0% em todos os setores (`qi_fundamental_snapshot` vazio).

## 1.6 Universe aceito

Sem runs aceitos (0 linhas) antes do pipeline.

## 1.7 Última recomendação allocation

Nenhuma linha antes do pipeline.

## 1.8 Regime snapshot

Nenhuma linha antes do pipeline.

---

## Roadmap Sprints 2–6

Ver priorização em `PLANNING_AUDITORIA.md` (Downloads) ou plano Cursor; não executar até Sprint 1 fechado (FMP + universe + analysis + cobertura).
