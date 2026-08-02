# Etapa 1A — pronto para teste

**Entrega:** ingest fontes + macro por classe + score top-90% liquidez + snapshot Blob + Markets com fallback class macro.

**Não inclui (1B):** gráficos ao clicar indicador; tab All global 90%.

---

## Pré-requisitos na nuvem

### GitHub Actions (Settings → Secrets)

| Secret | Obrigatório |
|--------|-------------|
| `FRED_API_KEY` | Sim |
| `BLOB_READ_WRITE_TOKEN` | Sim |

### Vercel (Production)

| Variável | Obrigatório |
|----------|-------------|
| `BLOB_READ_WRITE_TOKEN` | Sim (app lê snapshot) |
| `DATABASE_URL`, `AUTH_*` | Para login + watchlist |
| `GITHUB_MOTOR_DISPATCH_TOKEN` + `GITHUB_REPO` | Opcional (★ on-demand imediato) |

---

## Passo 1 — Deploy app (automático)

Push em `main` → Vercel Production deploya a app (Git integration).

---

## Passo 2 — Motor Daily (dados)

GitHub → **Actions** → **Motor Daily** → **Run workflow**.

Primeira execução pode levar **1–3 h** (16 classes × top-90% × Yahoo).

Logs esperados:

1. Export catalog → `catalog_by_class.json`
2. Etapa 1 fontes
3. Macro + top-90% por aba
4. Relatórios MVP (`fi_treasury`, `credito_alternativo`)
5. Export snapshot + `validate_abas` OK
6. Upload Blob (`historico.db` + `dashboard-snapshot.json`)

Cron automático: **06:00 UTC** todos os dias.

---

## Passo 3 — Verificar snapshot

Local (com token):

```bash
npm run motor:verify-cloud-snapshot
```

Ou Vercel Blob: arquivo `motor/dashboard-snapshot.json` com `classes`, `tickers`, `asOf`, `quality.ok`.

---

## Passo 4 — Testar Markets (`/mercado`)

1. Login Google (se `AUTH_ENABLED=true`).
2. Adicionar símbolos líquidos (ex. **TLT**, **SCHP**, **ARCC**) via browse + ★.
3. Confirmar:
   - Cabeçalho da classe: score / stage / driver macro.
   - Papéis no top-90%: score **do ticker** (não só “Class macro”).
   - Entry: Validated / Not validated / Class macro / Analyzing.
   - **1D** % (Yahoo ou snapshot).
4. Papéil fora do top-90%: “Class macro” ou “Analyzing” até ★ com dispatch configurado.

---

## Comandos locais (opcional)

```bash
npm run motor:export-catalog
npm run motor:test-fontes
npm run motor:daily          # completo — demorado
npm run motor:validate-abas
npm run motor:blob-upload    # precisa BLOB_READ_WRITE_TOKEN
npm run dev
```

---

## Critérios de aceite 1A

- [ ] Motor Daily workflow verde
- [ ] Snapshot com `quality.ok` e `tickerCount` > 10
- [ ] `fi_treasury` + `alt_bdc` em `classes`; **TLT** + **ARCC** em `tickers`
- [ ] Markets mostra scores (não tudo “Analyzing”) após daily
- [ ] Relatórios `.md` em Blob (`motor/reports/`)

Quando tudo OK → iniciar **1B** (charts on click).
