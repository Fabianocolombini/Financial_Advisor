# Comando Claude Web — disparar Motor Daily (sem terminal)

Use quando o assistente tem **apenas browser** (GitHub UI) — sem `git`, `gh`, `vercel` CLI ou terminal.

---

## Prompt (copiar bloco inteiro)

```
Projeto: Fabianocolombini/Financial_Advisor (branch main)
Produção: https://financial-advisor-sable.vercel.app

Contexto: Etapa 1A + **Fase 2 enriquecimento** — Motor Daily popula snapshot Markets (scores top-90% liquidez + models.regime no JSON).

**Fase 2 (browser):** ver também [COMANDO_CLAUDE_WEB_FASE2.md](COMANDO_CLAUDE_WEB_FASE2.md) — Motor External Weekly, validação `models.calibrated`, expectativa de UI.

FERRAMENTAS DISPONÍVEIS: browser GitHub (e opcional Vercel dashboard). SEM terminal, git, gh ou vercel CLI.

TAREFAS (ordem):

A) SECRETS GitHub Actions (obrigatório antes de run verde)
   Repo → Settings → Secrets and variables → Actions
   Confirmar que existem:
   - FRED_API_KEY  (API FRED — sem isso o job falha em ~90s)
   - BLOB_READ_WRITE_TOKEN (upload snapshot SQLite)

   Se FRED_API_KEY falta: pedir ao usuário a chave FRED (fred.stlouisfed.org) OU
   orientar: Vercel → financial-advisor → Settings → Environment Variables →
   Production → FRED_API_KEY → Reveal → copiar → criar secret no GitHub com o mesmo nome.

   NÃO expor o valor da chave na resposta — só confirmar "secret criado".

B) DISPARAR workflow (único método viável com browser)
   Actions → Motor Daily → Run workflow → branch main → Run workflow
   Confirmar job "motor" IN PROGRESS (não "skipped").

C) CHECAR FALHA RÁPIDA (~90s)
   Se falhou em menos de 2 min → quase sempre FRED_API_KEY ausente no GitHub.
   Step "Preflight — secrets obrigatórios" ou log: "FRED_API_KEY não definida".

D) SUCESSO (job longo 1–3 h)
   Logs esperados: catalog export → fontes + external_jobs → macro abas → top-90% → validate_abas → blob upload.
   Snapshot Fase 2: JSON deve ter bloco "models" (regime.calibrated) e classes.fi_treasury.abaId = "fi_treasury".
   Não precisa monitorar 3 h — reportar URL da run e pedir nova checagem depois.

E) APÓS JOB VERDE
   Usuário testa /mercado — scores em papéis líquidos (não tudo "Analyzing").

Reportar: URL da run, status, step que falhou (se falhou), secrets faltando.
NÃO expor CRON_SECRET, tokens, DATABASE_URL, FRED_API_KEY na resposta.
```

---

## Diagnóstico rápido (runs #2–#4)

| Run | Duração | Causa provável |
|-----|---------|----------------|
| #2–#4 | ~90–100s | `FRED_API_KEY` **ausente** nos GitHub Actions secrets |
| Job longo OK | 1–3 h | Pipeline 1A completo |

Erro típico no log:
```
FRED_API_KEY não definida (.env.local ou ambiente)
```

---

## Secrets

| Onde | Secret / variável | Obrigatório |
|------|-------------------|-------------|
| GitHub Actions | `FRED_API_KEY` | Sim |
| GitHub Actions | `BLOB_READ_WRITE_TOKEN` | Sim |
| Vercel Production | `BLOB_READ_WRITE_TOKEN` | Sim (app lê snapshot) |
| Vercel Production | `FRED_API_KEY` | Sim (crons ingest; motor usa GH) |

---

Ver: [ETAPA_1A_TESTE.md](ETAPA_1A_TESTE.md), [GUIA_OPERACAO_CLAUDE_WEB.md](GUIA_OPERACAO_CLAUDE_WEB.md).
