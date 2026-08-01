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

Com texto na busca: busca normal por símbolo/nome (sem filtro 90%).

---

## Tabela canónica (17 classes + All)

| Tab UI | `classId` | Papéis no catálogo* | Aba motor | `aba_id` | Benchmark técnico† | Manifesto FRED |
|--------|-----------|-------------------|-----------|----------|-------------------|----------------|
| Cash | `cash_equivalents` | 30 | ✅ | `cash_equivalents` | AGG | `fontes_manifest` |
| Treasuries | `fi_treasury` | 30 | ✅ | `taxas` | AGG | taxas / Treasury |
| IG Bonds | `fi_ig` | 26 | ✅ | `fi_ig` | AGG | spreads IG |
| High Yield | `fi_hy` | 28 | ✅ | `fi_hy` | AGG | spreads HY |
| TIPS | `fi_tips` | 25 | ✅ | `fi_tips` | AGG | breakevens, DFII10 |
| Preferred | `fi_preferred` | 30 | ❌ | — | AGG | PFF proxy |
| US Equity | `us_equity` | 30 | ✅ | `us_equity` | SPY | VIX, curva |
| International | `intl_equity` | 43 | ❌ | — | SPY | EFA/VEA proxy |
| Emerging | `em_equity` | 29 | ❌ | — | SPY | EEM proxy |
| REITs | `real_estate` | 29 | ✅ | `reits` | AGG | VNQ, DGS10 |
| Metals | `commodities_precious` | 30 | ❌ | — | GLD | GLD, DFII10 |
| Energy | `commodities_energy` | 30 | ❌ | — | USO | WTI, Henry Hub |
| MLP | `energy_mlp` | 30 | ❌ | — | SPY | AMLP, oil |
| Biotech | `healthcare_biotech` | 30 | ✅ | `healthcare_biotech` | SPY | VIX, curva |
| BDC | `alt_bdc` | 30 | ✅ | `credito_alternativo` | AGG | EDGAR + HY spread |
| Infra | `alt_infrastructure` | 28 | ❌ | — | SPY | IGF proxy |
| FX | `currencies` | 30 | ❌ | — | UUP | FX + macro |

\* Contagem após dedupe em `CATALOG_INSTRUMENTS` (508 símbolos total).  
† Benchmark usado no score técnico on-demand (`motor/src/config/aba_class_map.py`).

**Arquivos-chave**

- Tabs UI: `lib/catalog/asset-classes.ts`
- Catálogo curado: `lib/catalog/instruments.ts`
- Busca + ranking: `lib/catalog/search.ts`, `app/api/catalog/search/route.ts`
- Mapa motor: `motor/src/config/aba_class_map.py`
- Abas JSON: `motor/config/abas/*.json`
- Manifesto macro: `motor/config/fontes_manifest.json`

---

## Descrição por classe (para revisão)

### Renda fixa / caixa

| `classId` | O que entra | Exemplos catálogo | Notas |
|-----------|-------------|-------------------|--------|
| `cash_equivalents` | T-bills, ultra-short, floating Treasury | SHV, BIL, SGOV, TFLO | Overlap com Treasuries curto; OK para sleeve “cash” |
| `fi_treasury` | Treasuries duration ladder, agregados soberanos | TLT, IEF, GOVT, SCHR | Motor aba `taxas` (nome legado) |
| `fi_ig` | Corporativo IG, agregados | LQD, VCIT, AGG overlap | Spread OAS FRED |
| `fi_hy` | HY corporativo, fallen angel | HYG, JNK, ANGL | |
| `fi_tips` | TIPS ETFs | TIP, SCHP, STIP | Motor aba `fi_tips` |
| `fi_preferred` | Preferred ETFs | PFF, FPE, PGX | **Sem aba motor** — só macro manifest |

### Equities

| `classId` | O que entra | Exemplos | Notas |
|-----------|-------------|----------|--------|
| `us_equity` | Broad US, factor, size | SPY, QQQ, IWM, VOO | Motor `us_equity` |
| `intl_equity` | Developed + broad ex-US, país/região | EFA, VEA, VEU, URTH, EWJ, DXJ | Tab **International**; expandido ago/2026 |
| `em_equity` | EM broad + single country | EEM, VWO, FXI, INDA | Separado de International |

### Alternativos / temáticos

| `classId` | O que entra | Notas |
|-----------|-------------|--------|
| `real_estate` | US/global REITs | Motor `reits` |
| `healthcare_biotech` | Biotech ETFs (+ alguns stocks no raw) | Motor `healthcare_biotech` |
| `alt_bdc` | BDCs listed | Motor `credito_alternativo` → class `alt_bdc` |
| `alt_infrastructure` | Infra ETFs | Sem motor aba |

### Commodities / FX

| `classId` | O que entra | Notas |
|-----------|-------------|--------|
| `commodities_precious` | Gold, silver, broad metals | GLD, IAU, SLV |
| `commodities_energy` | Oil, gas, broad energy equity | USO, XLE |
| `energy_mlp` | MLP energy | AMLP, MLPA |
| `currencies` | Currency ETFs + majors forex | UUP, FXE, EURUSD |

---

## Motor: o que existe vs catálogo

### Abas com pipeline completo (`motor/config/abas/`)

1. `taxas` → Treasuries  
2. `cash_equivalents` → Cash  
3. `fi_ig`, `fi_hy`, `fi_tips`  
4. `us_equity`  
5. `reits` → REITs  
6. `healthcare_biotech` → Biotech  
7. `credito_alternativo` → BDC (`alt_bdc`)

### Classes só no catálogo (score on-demand ★ ainda **não** dispara motor)

`fi_preferred`, `intl_equity`, `em_equity`, `commodities_precious`, `commodities_energy`, `energy_mlp`, `alt_infrastructure`, `currencies`

→ Markets mostra **Analyzing** ou fallback Yahoo 1D até existir aba + workflow.

---

## Backlog de melhorias (para Claude / humano)

### Prioridade alta

1. **Abas motor faltantes:** `intl_equity`, `em_equity`, `fi_preferred` (MVP internacional + preferred).
2. **Unificar overlap Cash vs Treasuries:** SHY/SHV aparecem em ambos — definir regra (primário por sleeve ou tag secundária).
3. **Cache ranking volume:** `volume-rank` chama Yahoo para todos os papéis da classe (~30–43 requests); cache 1h por `classId` no servidor.
4. **`GITHUB_MOTOR_DISPATCH_TOKEN`** no GitHub Secrets para ★ disparar `motor-symbol`.

### Prioridade média

5. Commodities + MLP + Infra + FX: abas motor ou aceitar “só catálogo + Yahoo 1D”.
6. **International:** validar se FLLA/FLKR (single country) devem ficar em `intl_equity` vs `em_equity`.
7. **BDC:** catálogo é stocks BDC; motor usa EDGAR — alinhar universo aba com top 90% liquidez.
8. **REITs:** incluir VNQI/IFGL em ranking internacional real estate vs `real_estate` US.

### Prioridade baixa / produto

9. Tab **All** com ranking global 90% (pesado; ~508 símbolos).
10. Mostrar volume 90d absoluto (opcional) além do % na UI.
11. Gráficos ao clicar linha (histórico já em `price_daily` após ★).

---

## Convenções

- **ID canónico:** `classId` snake_case — usado em Prisma watchlist, catálogo, motor map.
- **UI pt/en:** tabs em inglês curto; relatórios motor em pt-BR.
- **Dados EOD:** motor e ranking usam fechamento anterior (não intraday).
- **Disclaimers:** educacional; não é assessoria regulada.

---

## Comandos úteis

```bash
# Contagem catálogo por classe
npx tsx -e "import { CATALOG_INSTRUMENTS } from './lib/catalog/instruments.ts'; ..."

# Motor on-demand local (um símbolo)
npm run motor:symbol -- --symbol SCHP --class-id fi_tips

# Listar abas
ls motor/config/abas/
```

---

## Docs relacionados

- [taxonomia-oficial-classes-ativos.md](taxonomia-oficial-classes-ativos.md) — hierarquia Callan/GICS (visão estratégica)
- [tabela-classes-ativos-indicadores.md](tabela-classes-ativos-indicadores.md) — indicadores por classe
- [schema-dados-abas.md](schema-dados-abas.md) — JSON das abas motor
- [GUIA_OPERACAO_CLAUDE_WEB.md](GUIA_OPERACAO_CLAUDE_WEB.md) — deploy, secrets, smoke tests
