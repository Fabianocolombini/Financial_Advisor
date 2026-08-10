# Plano de Correção — Modelos de Regime e Seleção

*Atualizado: 2026-08-10 — pós-correções T1/T8 e auditoria*

## Status geral

| Área | Status |
|------|--------|
| 17 classes implementadas | ✅ |
| Testes bloqueantes T1, T6, T8 | ✅ PASS (após correções) |
| Teste bloqueante T4 (HY 2008) | ⚠️ JANELA REDUZIDA (dados FRED) |
| Teste não-bloqueante T3 (HY 2020) | ⚠️ JANELA REDUZIDA (mesma limitação) |
| Testes T5, T7, T9, T10 | ⏳ Não implementados |
| Nível de maturidade | N2=16, N3=1 (fi_tips com T6 PASS) |

## Bloqueantes (prioridade 1) — status após correções

### T1 — Treasury inflation_shock 2022 ✅ CORRIGIDO

**Problema:** `flight_to_quality` disparava 13 dias em 2022 (quedas pontuais de ΔY real de 20d com VIX alto — rally de bonds no final do ano e choque Ucrânia em março).

**Correção aplicada** (`treasury_regime_model.py`):
- `inflation_shock`: VIX pct > 80% **e** (ΔY₂₀ > 0 **ou** ΔY₆₀ > 0 **ou** ΔY₉₀ > 0)
- `flight_to_quality`: VIX pct > 80% **e** ΔY₂₀ < 0 **e** ΔY₆₀ ≤ 0 **e** ΔY₉₀ ≤ 0 **e** sem inflation_shock
- Racional: regime inflacionário de 2022 tinha tendência de alta em janelas de 60–90d mesmo com dips de 20d; COVID 2020 mantém flight_to_quality (ΔY₉₀ negativo em março/2020).

**Resultado:** `inflation_shock_days=82`, `flight_to_quality_2022=0` → **PASS**

### T8 — Preferred bank_stress mar-mai/2023 ✅ CORRIGIDO

**Problema:** Série `kre_vs_spy_60d` vazia — KRE não estava no manifesto de ingestão yfinance.

**Correção aplicada:**
- `KRE` adicionado em `fontes_manifest.json` → `tickers_teste`
- `kre_vs_spy_60d` registrado em `fontes_registry.py` (fórmula sem deps FRED)
- Ingest local: KRE desde 2015-01-01 (2917 linhas)

**Resultado:** `bank_stress_days_mar-mai/2023=15` → **PASS**

### T4 — HY sem Overweight set-out/2008 ⚠️ JANELA REDUZIDA (aceito)

**Problema:** FRED restringe séries ICE/BofA (`BAMLH0A0HYM2`, `BAMLC0A0CM`, etc.) a janela rolante de ~3 anos (desde 2023-08-11). Não é bug de threshold — é limitação da fonte gratuita.

**Ação:** Manter status `JANELA REDUZIDA` no audit. Modelo não gera Overweight no período disponível (2023+). Teste 2008 requer fonte alternativa (ver seção Dados).

### T6 — TIPS tips_liquidity fev-abr/2020 ✅ PASS (sem alteração)

## Testes retroativos pendentes (T5, T7, T9, T10)

| ID | Classe | Período | Critério | Prioridade |
|----|--------|---------|----------|------------|
| T5 | Cash | 2022 | Score sobe ao longo do ano (fed hiking) | Média |
| T7 | TIPS | jan-jun/2021 | Score favorece TIPS (inflação) | Baixa |
| T9 | Preferred | 2021 | F_capped satura em 0.6 | Baixa |
| T10 | REITs | 2022 | Score cai (taxas sobem) | Média |

**Próximo passo:** Implementar `sanity_check_*` em cada `*_regime_model.py` e registrar no `audit_models.py`.

## Dados faltantes / ingest

| Série / ticker | Uso | Status | Ação |
|----------------|-----|--------|------|
| `KRE` | bank_stress (Preferred) | ✅ Ingerido | Manter no manifesto; Motor Daily deve ingerir |
| `SPY` | KRE relativo, benchmarks | ✅ Já existia | — |
| `BAMLH0A0HYM2` | HY OAS | ⚠️ Só desde 2023-08 | Ver alternativas abaixo |
| `BAMLH0A3HYC` | HY quality ratio | ⚠️ Só desde 2023-08 | Idem |
| `BAMLC0A0CM` | IG OAS | ⚠️ Só desde 2023-08 | Idem |

### T3 — HY hy_stress fev-abr/2020 ⚠️ JANELA REDUZIDA (não é bug de threshold)

**Investigação:** Com dados disponíveis (2023+), `hy_stress_flag` nunca dispara em 2020 — a série está vazia para o período. Thresholds (ΔH_z > 1.5, V_pct > 0.80) não foram alterados; não há evidência de bug com dados completos.

**Opções para histórico HY (decisão pendente):**
1. **Proxy HYG:** usar preço/vol HYG como proxy de widening (já parcialmente em `hy_distress_proxy_score`)
2. **Cache local:** snapshot histórico BAML pré-2023 se disponível em outro ambiente
3. **Aceitar limitação:** T3/T4 como `JANELA REDUZIDA` até Lote 3 com fonte paga ou ALFRED vintage download manual
4. **Série alternativa FRED:** avaliar spreads não-ICE (ex. `TEDRATE` é proxy fraco; não substitui OAS)

## Proxies a melhorar

| Proxy | Classe | Gap | Sugestão |
|-------|--------|-----|----------|
| `hy_distress_proxy_score` | HY | Sem OAS histórico | Peso maior em HYG vol + CCC proxy quando OAS < 3y |
| `bond_vol_proxy` | Treasury | MOVE indisponível grátis | Manter VIX/TNX vol; documentado |
| `infra_gov_z` | Infrastructure | Dados limitados | Continuar com utilities proxy |
| `nareit_yield_spread` | REITs | Scraping mensal | OK para MVP |

## Revisão manual B5/C7

Itens que permanecem **MANUAL** no audit (revisão humana periódica):

- **B5:** Sinais (+/−), inversões, clip assimétrico em todas as 17 classes
- **C7 parcial:** Direção de overrides automatizada; casos limite (ex. EM duplo gatilho DXY+VIX) revisar anualmente
- **G3 RSI JAAA:** Alinhado (PASS); revalidar se mudar janela técnica

## Decisões pendentes

| Tópico | Opções | Recomendação |
|--------|--------|--------------|
| T1 interpretação | ΔY único vs multi-janela | ✅ Adotado multi-janela (20/60/90d) |
| HY histórico T3/T4 | Proxy HYG vs aceitar janela | Aceitar janela até Lote 3; documentar |
| FX hedge | Modelo currencies sem hedge explícito | Backlog Lote 3 |
| `calibrated: true` | Nunca marcar sem fit estatístico | Manter `false` em todas as configs |
| KRE ingest no CI | Só local vs Motor Daily automático | Incluir KRE no pipeline yfinance do daily |

## Cronograma sugerido (Lote 3 readiness)

| Semana | Entrega |
|--------|---------|
| S0 (atual) | ✅ T1/T8 corrigidos; plano documentado; audit atualizado |
| S1 | Implementar T5 (Cash 2022) + T10 (REITs 2022) |
| S2 | Implementar T7 (TIPS 2021) + T9 (Preferred F_capped 2021) |
| S3 | Avaliar proxy HY histórico ou cache BAML; reexecutar T3/T4 |
| S4 | Revisão B5 manual + promoção fi_treasury/fi_preferred para N3 |
| S5 | Lote 3: FX hedge, infra proxies, calibração opcional com disclaimer |

---

*Referência: `docs/AUDITORIA_MODELOS.md` (gerado por `motor/scripts/audit_models.py`)*
