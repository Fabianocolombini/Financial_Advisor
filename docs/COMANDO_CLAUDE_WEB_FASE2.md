# Comando Claude Web — Fase 2 Enriquecimento + operações manuais

Use quando o assistente tem **apenas browser** (GitHub / Vercel UI) — sem terminal, `git`, `gh` ou `vercel` CLI.

**Contexto Fase 2:** motor com indicadores Tipo A/B, `external_series`, regime logit (`models.regime.calibrated`), scrapers.  
**Markets UI não mudou** — novos dados estão no **Blob snapshot** e relatórios `.md`, não em colunas novas na tabela.

---

## Prompt principal (copiar bloco inteiro)

```
Projeto: Fabianocolombini/Financial_Advisor (branch main)
Produção: https://financial-advisor-sable.vercel.app/mercado

Contexto: Fase 2 enriquecimento — Motor Daily atualiza snapshot no Vercel Blob.
A UI Markets NÃO mostra colunas novas; validar via Actions + Blob, não só pela tela.

FERRAMENTAS: browser GitHub + Vercel. SEM terminal, git, gh ou vercel CLI.

─── A) SECRETS GitHub Actions (antes de qualquer run) ───
Repo → Settings → Secrets and variables → Actions

Obrigatórios:
  • FRED_API_KEY
  • BLOB_READ_WRITE_TOKEN

Opcional (scrapers extras):
  • EIA_API_KEY — só se fonte EIA habilitada no manifest (estoque cru já vem do FRED WCESTUS1)

Confirmar existência. NÃO expor valores na resposta — só "presente" / "ausente".

─── B) SECRETS / ENV Vercel Production ───
Vercel → financial-advisor → Settings → Environment Variables → Production

Obrigatórios para /mercado com scores:
  • BLOB_READ_WRITE_TOKEN (app lê motor/dashboard-snapshot.json)
  • DATABASE_URL, AUTH_* (login + watchlist)

Opcional:
  • GITHUB_MOTOR_DISPATCH_TOKEN + GITHUB_REPO — ★ on-demand imediato na watchlist
  • FRED_API_KEY — crons app (motor usa GitHub)

Se alterou env → Redeploy Production.

─── C) DISPARAR Motor Daily (principal — 1–3 h) ───
GitHub → Actions → "Motor Daily" → Run workflow → branch main → Run workflow

Confirmar job "motor" IN PROGRESS (não "skipped").
Push com [motor-daily] na mensagem também dispara — mas com browser use Run workflow.

Falha rápida (~90s) → quase sempre FRED_API_KEY ausente no GitHub.
Step "Preflight — secrets obrigatórios" ou log FRED_API_KEY.

Sucesso esperado nos logs (ordem):
  1. Export catalog
  2. Etapa 1 fontes + external_jobs (scrapers degradam sem quebrar)
  3. Macro 17 abas + top-90% liquidez
  4. validate_abas OK
  5. Upload Blob (historico.db + dashboard-snapshot.json + relatórios)

─── D) DISPARAR Motor External Weekly (opcional — ~15 min) ───
Só quando scrapers semanais/mensais (AAII, NAAIM, Nareit, FDA, etc.) precisam refresh
fora do daily.

GitHub → Actions → "Motor External Weekly" → Run workflow → main

Requer BLOB_READ_WRITE_TOKEN. EIA_API_KEY opcional.
Após download do Blob, o workflow roda `init_db` (cria `external_series` / `ingestion_log` se o DB é pré-Fase 2).
Não exporta snapshot sozinho — só atualiza SQLite no Blob.
Rodar Motor Daily depois se quiser scores/snapshot com dados novos integrados.

Cron automático: segundas 07:00 UTC.

─── E) VALIDAR snapshot Fase 2 (sem terminal) ───

Opção 1 — Vercel Blob (se UI disponível):
  Blob store → arquivo motor/dashboard-snapshot.json
  Abrir JSON e confirmar:
    • "updatedAt" recente (após run verde)
    • "tickerCount" ~200+
    • "models": { "regime": { "calibrated": true ou false, "regime_risk_probability": ... } }
    • classes.fi_treasury.abaId = "fi_treasury" (NÃO "taxas")
    • classes.fi_treasury.indicators pode incluir "real_yield_curve"
    • algum indicador com "isProxy": true (ex. fi_hy, us_equity proxies)

Opção 2 — Produção /mercado (UI):
  • Scores em papéis líquidos (não tudo "Analyzing")
  • Cabeçalho classe Treasuries: driver macro (ex. yield real) — pode mudar após Fase 2
  • Coluna Driver em TLT/IEF: ainda técnico (Preço vs MM200) — ESPERADO nesta fase
  • NÃO esperar colunas novas (CAPE, regime, proxies) na tabela — isso é Etapa 1B

Cache app: snapshot revalida ~5 min; após Motor Daily verde, aguardar ou hard refresh.

─── F) SE MOTOR DAILY FALHOU ───

| Sintoma | Ação |
|---------|------|
| ~90s, FRED_API_KEY | Criar secret GitHub; copiar de Vercel FRED_API_KEY se existir |
| validate_abas fail | Abrir log do step; reportar issue |
| blob upload fail | BLOB_READ_WRITE_TOKEN no GitHub |
| Job skipped | Run workflow manual (push sem [motor-daily] não dispara) |
| External Weekly: `no such table: external_series` | DB Blob antigo — re-run após fix `init_db` no workflow (commit recente) |

─── G) REPORTAR AO USUÁRIO ───

• URL da run Motor Daily (e External Weekly se rodou)
• Status final (verde/vermelho) + step que falhou
• Secrets ausentes (nomes apenas)
• Se possível: updatedAt do snapshot, tickerCount, models.regime.calibrated
• Lembrar: UI igual é normal — Fase 2 não alterou colunas Markets

NÃO expor: FRED_API_KEY, BLOB_READ_WRITE_TOKEN, CRON_SECRET, DATABASE_URL, PATs.
```

---

## Quando rodar cada workflow

| Workflow | Frequência | Manual via browser | Duração típica |
|----------|------------|--------------------|----------------|
| **Motor Daily** | Diário 06:00 UTC + `[motor-daily]` push | Actions → Run workflow | 1–3 h |
| **Motor External Weekly** | Segundas 07:00 UTC | Actions → Run workflow | 5–30 min |

**Ordem recomendada após deploy Fase 2:** Motor Daily (obrigatório) → opcional External Weekly → se só Weekly, rodar Daily depois para snapshot.

---

## O que NÃO precisa rodar manualmente

| Item | Motivo |
|------|--------|
| Export snapshot local | Motor Daily faz export + upload |
| `npm run motor:pipeline` por aba | Incluído no Daily |
| Redeploy Vercel só por motor | App lê Blob; deploy só se mudou código Next ou env |
| EIA scraper | Desabilitado por default; estoque cru = FRED `WCESTUS1` |

---

## Diagnóstico rápido

| Situação | Causa provável |
|----------|----------------|
| /mercado igual após código novo | Blob não atualizado (Daily não verde ou não rodou) |
| Treasuries driver antigo | Snapshot antigo com `abaId: taxas` — Daily recente corrige |
| Driver = Preço vs MM200 | Normal — ticker score é técnico; macro está no cabeçalho da classe |
| `models` ausente no Blob | Daily antigo (pré-Fase 2) ou export falhou |

---

## Referências

| Doc | Conteúdo |
|-----|----------|
| [enriquecimento-indicadores.md](enriquecimento-indicadores.md) | Tipo A/B/C, proxies, limitações UI |
| [COMANDO_CLAUDE_WEB_MOTOR_DAILY.md](COMANDO_CLAUDE_WEB_MOTOR_DAILY.md) | Prompt focado só no Daily (1A) |
| [ETAPA_1A_TESTE.md](ETAPA_1A_TESTE.md) | Smoke test Markets |
| [GUIA_OPERACAO_CLAUDE_WEB.md](GUIA_OPERACAO_CLAUDE_WEB.md) | Deploy Vercel + secrets gerais |
