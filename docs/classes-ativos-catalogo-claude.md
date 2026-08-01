# Classes de ativo — catálogo, busca e motor (referência Claude)

Documento vivo para revisar taxonomia, cobertura do catálogo e gaps do motor.  
**Última atualização:** ago/2026 · alinhado a `lib/catalog/asset-classes.ts` e `motor/config/abas/`.

---

## Onde isso aparece na app

| Superfície | Comportamento |
|------------|----------------|
| **Busca (header)** | Tabs por classe; ★ adiciona à watchlist do usuário |
| **Markets** (`/mercado`) | Símbolos seguidos, scores motor, 1D, stage, entry |
| **Motor on-demand** | Ao dar ★, dispara workflow `motor-symbol` (histórico EOD + score do papel) |
| **Motor daily** | Só macro da **classe** (FRED); não roda todos os ETFs do universo |

### Ranking na busca (sem texto digitado)

Ao selecionar uma classe (não “All”):

- Ordena por **volume em dólares** (preço × volume) nos **últimos ~90 dias** (Yahoo EOD)
- Mostra **% de relevância** do papel no total da classe
- Lista até **90% acumulado** da liquidez da classe
- Implementação: `lib/catalog/volume-rank.ts` → `searchCatalog()` quando `q` vazio
- **Cache:** `unstable_cache` 1h por `classId` em `lib/catalog/search.ts`

Com texto na busca: busca normal por símbolo/nome (sem filtro 90%).

---

## Tabela canónica (17 classes + All)

| Tab UI | `classId` | Papéis no catálogo* | Aba motor | `aba_id` | Benchmark técnico† | Manifesto FRED |
|--------|-----------|-------------------|-----------|----------|-------------------|----------------|
| Cash | `cash_equivalents` | 25 | ✅ | `cash_equivalents` | AGG | DTB3, CPI |
| Treasuries | `fi_treasury` | 30 | ✅ | `fi_treasury` | AGG | curva, DGS10 |
| IG Bonds | `fi_ig` | 26 | ✅ | `fi_ig` | AGG | spreads IG |
| High Yield | `fi_hy` | 28 | ✅ | `fi_hy` | AGG | spreads HY |
| TIPS | `fi_tips` | 25 | ✅ | `fi_tips` | AGG | breakevens, DFII10 |
| Preferred | `fi_preferred` | 30 | ✅ | `fi_preferred` | AGG | PFF proxy |
| US Equity | `us_equity` | 55+ | ✅ | `us_equity` | SPY | VIX, curva |
| International | `intl_equity` | 43 | ✅ | `intl_equity` | SPY | EFA/VEA proxy |
| Emerging | `em_equity` | 29 | ✅ | `em_equity` | SPY | EEM proxy |
| REITs | `real_estate` | 29 | ✅ | `reits` | VNQ | VNQ, DGS10 |
| Metals | `commodities_precious` | 30 | ✅ | `commodities_precious` | GLD | GLD, DFII10 |
| Energy | `commodities_energy` | 30 | ✅ | `commodities_energy` | USO | WTI, Henry Hub |
| MLP | `energy_mlp` | 30 | ❌ | — | AMLP | AMLP, oil |
| Biotech | `healthcare_biotech` | 30 | ✅ | `healthcare_biotech` | SPY | VIX, curva |
| BDC | `alt_bdc` | 30 | ✅ | `credito_alternativo` | HYG | EDGAR + HY spread |
| Infra | `alt_infrastructure` | 28 | ✅ | `alt_infrastructure` | IGF | IGF proxy |
| FX | `currencies` | 30 | ✅ | `currencies` | UUP | FX + macro |

\* Contagem após dedupe em `CATALOG_INSTRUMENTS`.  
† Benchmark usado no score técnico on-demand (`motor/src/config/aba_class_map.py`). MLP/Infra usam benchmark **setorial** (AMLP/IGF), não SPY.

**Arquivos-chave**

- Tabs UI: `lib/catalog/asset-classes.ts`
- Catálogo curado: `lib/catalog/instruments.ts`
- Busca + ranking: `lib/catalog/search.ts`, `app/api/catalog/search/route.ts`
- Mapa motor: `motor/src/config/aba_class_map.py`
- Abas JSON: `motor/config/abas/*.json`
- Manifesto macro: `motor/config/fontes_manifest.json`

---

## Regra Cash vs Treasuries (maturidade primária)

Convenção Morningstar-style: **&lt;1 ano → Cash**; **≥1 ano → Treasuries**.

| Classe | Exemplos |
|--------|----------|
| `cash_equivalents` | SHV, BIL, SGOV, GBIL, TBIL |
| `fi_treasury` | SHY, IEF, TLT, IEI, SCHO, SPTS, VGSH |

Sem overlap no catálogo (`lib/catalog/instruments.ts`).

---

## Descrição por classe (para revisão)

### Renda fixa / caixa

| `classId` | O que entra | Exemplos catálogo | Notas |
|-----------|-------------|-------------------|--------|
| `cash_equivalents` | T-bills, ultra-short, floating Treasury | SHV, BIL, SGOV, TFLO | Maturidade &lt;1y |
| `fi_treasury` | Treasuries duration ladder, agregados soberanos | TLT, IEF, GOVT, SHY | Motor aba `fi_treasury` (alias legado `taxas` no SQLite) |
| `fi_ig` | Corporativo IG, agregados | LQD, VCIT, AGG overlap | Spread OAS FRED |
| `fi_hy` | HY corporativo, fallen angel | HYG, JNK, ANGL | |
| `fi_tips` | TIPS ETFs | TIP, SCHP, STIP | Motor aba `fi_tips` |
| `fi_preferred` | Preferred ETFs | PFF, FPE, PGX | Motor aba `fi_preferred` |

### Equities

| `classId` | O que entra | Exemplos | Notas |
|-----------|-------------|----------|--------|
| `us_equity` | Broad US, factor, size, GICS sectors | SPY, QQQ, XLK, AAPL | Motor `us_equity`; filtro GICS na busca |
| `intl_equity` | Developed + broad ex-US | EFA, VEA, VEU, URTH, EWJ | Motor `intl_equity` |
| `em_equity` | EM broad + single country | EEM, VWO, FXI, INDA | Motor `em_equity` |

### Alternativos / temáticos

| `classId` | O que entra | Notas |
|-----------|-------------|--------|
| `real_estate` | US/global REITs | Motor `reits` |
| `healthcare_biotech` | Biotech ETFs | Motor `healthcare_biotech` |
| `alt_bdc` | BDCs listed | Motor `credito_alternativo` — universo alinhado ao catálogo (30 BDCs + HYG) |
| `alt_infrastructure` | Infra ETFs | Motor `alt_infrastructure`; benchmark IGF |

### Commodities / FX

| `classId` | O que entra | Notas |
|-----------|-------------|--------|
| `commodities_precious` | Gold, silver, miners | Motor `commodities_precious` (reusa DFII10/CPI FRED) |
| `commodities_energy` | Oil, gas, energy equity | Motor `commodities_energy` (WTI + Henry Hub) |
| `energy_mlp` | MLP energy | Sem motor aba; benchmark AMLP |
| `currencies` | Currency ETFs | Motor `currencies` |

---

## Motor: o que existe vs catálogo

### Abas com pipeline (`motor/config/abas/` — 16 abas)

1. `fi_treasury` → Treasuries  
2. `cash_equivalents` → Cash  
3. `fi_ig`, `fi_hy`, `fi_tips`, `fi_preferred`  
4. `us_equity`, `intl_equity`, `em_equity`  
5. `reits` → REITs  
6. `healthcare_biotech` → Biotech  
7. `credito_alternativo` → BDC (`alt_bdc`)  
8. `commodities_precious`, `commodities_energy`, `currencies`  
9. `alt_infrastructure` → Infra

### Classes só no catálogo (score on-demand ★ sem aba dedicada)

`energy_mlp` → Markets mostra **Analyzing** ou fallback Yahoo 1D até existir aba motor dedicada.

---

## Backlog de melhorias (ordem revisada ago/2026)

### ✅ Feito nesta rodada

1. Cache ranking volume (1h / `classId`)
2. Abas motor baratas: `commodities_precious`, `commodities_energy`, `currencies`
3. Regra Cash vs Treasuries + rename `taxas` → `fi_treasury`
4. Universo BDC motor alinhado ao catálogo (30 tickers + HYG)
5. Benchmarks setoriais: `energy_mlp` → AMLP, `alt_infrastructure` → IGF, `alt_bdc` → HYG
6. Abas motor: `fi_preferred`, `intl_equity`, `em_equity`
7. Aba motor `alt_infrastructure` (EDGAR + macro FRED)
8. Filtro GICS por setor na busca `us_equity` (UI + API)

### Próximo

1. **`energy_mlp`** — aba motor com benchmark AMLP (decisão: aba dedicada vs reutilizar `commodities_energy`)
2. **`GITHUB_MOTOR_DISPATCH_TOKEN`** nos GitHub Secrets (★ → `motor-symbol`)
3. Tab **All** com ranking global 90% (~508 símbolos — pesado)
4. Gráficos ao clicar linha (histórico em `price_daily` após ★)

### Decisão documentada — Utilities / GICS setorial

**Não** criar 11 abas motor separadas por setor GICS (XLK, XLF, …). O filtro de setor fica na **busca UI** (`us_equity` tab + `sector` query param). O motor continua com uma aba `us_equity` macro; setores são camada de descoberta no catálogo, não sleeves de alocação independentes. Utilities (`XLU`, `VPU`, `UTES`) permanecem em `alt_infrastructure` no catálogo — não duplicar em `us_equity` para evitar overlap de classe.

---

## Convenções

- **ID canónico:** `classId` snake_case — watchlist, catálogo, motor map.
- **Motor aba id** = nome do JSON (`fi_treasury`, não `taxas`).
- **UI pt/en:** tabs em inglês curto; relatórios motor em pt-BR.
- **Dados EOD:** motor e ranking usam fechamento anterior.
- **Disclaimers:** educacional; não é assessoria regulada.

---

## Comandos úteis

```bash
npm run motor:pipeline -- --aba fi_treasury
npm run motor:symbol -- --symbol GLD --class-id commodities_precious
ls motor/config/abas/
```

---

## Docs relacionados

- [taxonomia-oficial-classes-ativos.md](taxonomia-oficial-classes-ativos.md)
- [tabela-classes-ativos-indicadores.md](tabela-classes-ativos-indicadores.md)
- [schema-dados-abas.md](schema-dados-abas.md)
- [GUIA_OPERACAO_CLAUDE_WEB.md](GUIA_OPERACAO_CLAUDE_WEB.md)
