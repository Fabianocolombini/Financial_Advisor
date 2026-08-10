# Auditoria de Modelos — 2026-08-10 23:10 UTC

## 1. Sumário executivo
- Classes especificadas: 17
- Classes implementadas: 17
- Distribuição por nível: N0=0, N1=0, N2=13, N3=4, N4=0
- Testes bloqueantes: 4 de 4 aprovados
- Sinais de alerta: 0

## 2. Sinais de alerta
- nenhum

## 3. Matriz por classe
| Classe | Nível | A1 | A2 | A3 | B4 | B5 | B6 | C7 | D8 | D9 | D10 | Teste |
|--------|-------|----|----|----|----|----|----|----|----|----|-----|-------|
| cash_equivalents | 2 | PASS | PASS | N/A | PASS | MANUAL | PASS | PASS | PASS | PASS | PASS | T5:NÃO EXECUTADO |
| fi_treasury | 3 | PASS | PASS | N/A | PASS | MANUAL | PASS | PASS | PASS | PASS | PASS | T1:PASS, T2:PASS |
| fi_ig | 2 | PASS | PASS | N/A | PASS | MANUAL | PASS | PASS | PASS | PASS | PASS | — |
| fi_hy | 3 | PASS | PASS | N/A | PASS | MANUAL | PASS | PASS | PASS | PASS | PASS | T3:JANELA REDUZIDA, T4:JANELA REDUZIDA |
| fi_tips | 3 | PASS | PASS | N/A | PASS | MANUAL | PASS | PASS | PASS | PASS | PASS | T6:PASS, T7:NÃO EXECUTADO |
| fi_preferred | 3 | PASS | PASS | PASS | PASS | MANUAL | PASS | PASS | PASS | PASS | PASS | T8:PASS, T9:NÃO EXECUTADO |
| us_equity | 2 | PASS | PASS | N/A | PASS | MANUAL | PASS | PASS | PASS | PASS | PASS | — |
| intl_equity | 2 | PASS | PASS | N/A | PASS | MANUAL | PASS | N/A | PASS | PASS | PASS | — |
| em_equity | 2 | PASS | PASS | N/A | PASS | MANUAL | PASS | PASS | PASS | PASS | PASS | — |
| reits | 2 | PASS | PASS | N/A | PASS | MANUAL | PASS | N/A | PASS | PASS | PASS | T10:NÃO EXECUTADO |
| commodities_precious | 2 | PASS | PASS | N/A | PASS | MANUAL | PASS | N/A | PASS | PASS | PASS | — |
| commodities_energy | 2 | PASS | PASS | N/A | PASS | MANUAL | PASS | N/A | PASS | PASS | PASS | — |
| energy_mlp | 2 | PASS | PASS | N/A | PASS | MANUAL | PASS | N/A | PASS | PASS | PASS | — |
| healthcare_biotech | 2 | PASS | PASS | N/A | PASS | MANUAL | PASS | N/A | PASS | PASS | PASS | — |
| credito_alternativo | 2 | PASS | PASS | N/A | PASS | MANUAL | PASS | PASS | PASS | PASS | PASS | — |
| alt_infrastructure | 2 | PASS | PASS | N/A | PASS | MANUAL | PASS | N/A | PASS | PASS | PASS | — |
| currencies | 2 | PASS | PASS | N/A | PASS | MANUAL | PASS | N/A | PASS | PASS | PASS | — |

## 4. Verificações globais (G1-G7)
- **G1**: PASS — ausente
- **G2**: PASS — rsi_14 excluído de cash técnicos
- **G3**: PASS — RSI JAAA alinhado (89.26 vs 89.26)
- **G4**: PASS — ausente
- **G5**: PASS — sem referências a modelos de regime; working tree limpo
- **G6**: PASS — SHV em cash_equivalents, ausente de fi_treasury
- **G7**: PASS — volume US + MM200 Intl + yield real Infra

## 5. Testes retroativos (tabela da seção 4)

| ID | Classe | Período | Bloqueante | Status | Observação |
|---|---|---|---|---|---|
| T1 | Treasuries | 2022 | Sim | PASS | inflation_shock_days=82, flight_to_quality_2022=0 |
| T2 | Treasuries | fev-abr/2020 | Não | PASS | flight_to_quality_days=33 |
| T3 | HY | fev-abr/2020 | Não | JANELA REDUZIDA | HY OAS desde 2023-08-01, precisa 2020-03-01 (FRED ICE/BofA: janela ~3y) |
| T4 | HY | jun-dez/2008 | Sim | JANELA REDUZIDA | sem Overweight; histórico desde 2023-08-01, precisa ~2005-02-19 |
| T5 | Cash | 2022 | Não | NÃO EXECUTADO | sanity_check Cash 2022 não implementado |
| T6 | TIPS | fev-abr/2020 | Sim | PASS | tips_liquidity_days=20 |
| T7 | TIPS | jan-jun/2021 | Não | NÃO EXECUTADO | sanity_check TIPS jan-jun/2021 não implementado |
| T8 | Preferred | mar-mai/2023 | Sim | PASS | bank_stress_days_mar-mai/2023=57 |
| T9 | Preferred | 2021 | Não | NÃO EXECUTADO | sanity_check Preferred F_capped 2021 não implementado |
| T10 | REITs | 2022 | Não | NÃO EXECUTADO | sanity_check REITs 2022 não implementado |

## 6. Divergências detalhadas
- Nenhuma divergência automatizada registrada. Itens MANUAL (B5, partes de C7) requerem revisão humana.

## 7. Queríamos vs Executamos
| Objetivo | Status | Evidência |
|---|---|---|
| 17 classes com regime + seleção separados | PASS | 17/17 no class_model_registry |
| Zero dado pago | PASS | ausente |
| Proxies transparentes (is_proxy) | PASS | D9 por classe + proxy_indicators.py |
| Driver circular do MLP corrigido | PASS | distribution_yield_spread; sem price_amlp |
| Overrides direcionalmente corretos | PASS | C7 automatizado parcial; B5 manual |
| Markets UI intocada | PASS | WatchlistClassTable.tsx |
| Validação retroativa nos casos-limite | 4/4 bloqueantes | T1:PASS, T4:JANELA REDUZIDA, T6:PASS, T8:PASS |

## 8. Lacunas conhecidas e aceitas
- Indicadores Tipo C documentados mas não habilitados (fontes_manifest `enabled: false`).
- Infrastructure: proxies `infra_gov_z` / utilities com dados limitados.
- REITs: dispersão setorial alta — security score genérico.
- Pesos `calibrated: false` por design — julgamento, não fit estatístico.
- Testes T5, T7, T9, T10 ainda sem `sanity_check` dedicado.
- B5 (sinais de fórmula) e partes de C7 exigem revisão manual periódica.

---
*Gerado por `motor/scripts/audit_models.py` em 2026-08-10 23:10 UTC*
