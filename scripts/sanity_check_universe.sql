-- PIS Milestone 1 - Fase 0 sanity check
-- Adaptado ao schema real atual:
-- - qi_asset.region não existe; região vem de metrics_cache->>'region'
-- - qi_regime_snapshot usa as_of_date/model_version; região está no sufixo de model_version
-- - qi_sector_score_snapshot usa sector_code/as_of_date
-- - qi_recommendation guarda symbol/action dentro de payload JSON

-- 1. Distribuição por tipo de ativo
SELECT asset_type, COUNT(*) FROM qi_asset GROUP BY asset_type ORDER BY 2 DESC;

-- 2. Distribuição por região
SELECT COALESCE(metrics_cache->>'region', 'unknown') AS region, COUNT(*)
FROM qi_asset
GROUP BY region
ORDER BY 2 DESC;

-- 3. Distribuição por setor GICS
SELECT gics_sector, COUNT(*) FROM qi_asset
WHERE gics_sector IS NOT NULL
GROUP BY gics_sector ORDER BY 2 DESC;

-- 4. Cobertura de preços por ativo (últimos 90 dias úteis)
SELECT
  a.symbol,
  COALESCE(a.metrics_cache->>'region', 'unknown') AS region,
  COUNT(p.id) AS price_count
FROM qi_asset a
LEFT JOIN qi_market_price_daily p ON p.asset_id = a.id
  AND p.trade_date >= CURRENT_DATE - INTERVAL '90 days'
WHERE a.is_active = true
GROUP BY a.id, a.symbol, region
HAVING COUNT(p.id) < 50
ORDER BY price_count ASC
LIMIT 50;

-- 5. Profundidade histórica
SELECT
  MIN(trade_date) AS oldest,
  MAX(trade_date) AS newest,
  COUNT(DISTINCT trade_date) AS days
FROM qi_market_price_daily;

-- 6. Snapshot atual do regime macro
SELECT
  split_part(model_version, ':', 2) AS region,
  as_of_date,
  regime_label,
  composite_score
FROM qi_regime_snapshot
WHERE kind = 'MACRO'
ORDER BY as_of_date DESC, region;

-- 7. Última análise setorial
SELECT sector_code, rank, composite_score
FROM qi_sector_score_snapshot
WHERE as_of_date = (SELECT MAX(as_of_date) FROM qi_sector_score_snapshot)
ORDER BY rank ASC;

-- 8. Recomendações vivas
SELECT
  payload->>'symbol' AS symbol,
  payload->>'action' AS action,
  payload->'rationale' AS rationale
FROM qi_recommendation
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY created_at DESC;

-- 9. Saúde dos jobs
SELECT job_name, status, started_at, finished_at, error_message
FROM qi_ingestion_job
ORDER BY started_at DESC NULLS LAST
LIMIT 20;
