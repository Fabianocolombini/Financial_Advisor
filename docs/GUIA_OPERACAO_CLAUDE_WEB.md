# Guia de operação — Financial Advisor (para Claude Web ou execução manual)

Use este documento como **prompt base** no Claude Web (ou outro assistente) para configurar deploy automático, secrets e verificação de produção.

**Repositório:** `https://github.com/Fabianocolombini/Financial_Advisor`  
**Produção:** `https://financial-advisor-sable.vercel.app`  
**Projeto Vercel:** `financial-advisor` (team `fabianocolombinis-projects`)

---

## Contexto rápido

| O que | Onde |
|-------|------|
| App Next.js | Vercel + Neon Postgres |
| Commits | GitHub `main` |
| CI (lint/test/build) | GitHub Actions `ci.yml` |
| Deploy Vercel | GitHub Actions `vercel-deploy.yml` **ou** integração Git Vercel |
| Motor Python (scores) | GitHub Actions `motor-daily.yml` 06:00 UTC → Vercel Blob |
| Snapshot Home/Markets | Blob `motor/dashboard-snapshot.json` |

**Problema comum:** commits aparecem no GitHub com CI verde, mas a Vercel **não builda** → integração Git desconectada ou falta `VERCEL_TOKEN` no GitHub.

---

## Tarefa 1 — Secret `VERCEL_TOKEN` no GitHub (obrigatório para deploy automático)

### Objetivo
Fazer o workflow `.github/workflows/vercel-deploy.yml` rodar em cada push em `main`.

### Passos

1. Abrir [Vercel Account Tokens](https://vercel.com/account/settings/tokens).
2. **Create Token** — nome sugerido: `github-financial-advisor-deploy`.
3. Copiar o token (só aparece uma vez).
4. GitHub → `Fabianocolombini/Financial_Advisor` → **Settings** → **Secrets and variables** → **Actions**.
5. **New repository secret:**
   - Name: `VERCEL_TOKEN`
   - Secret: paste do token Vercel
6. Confirmar que o secret existe na lista.

### Verificação
- Fazer um commit vazio ou re-run do workflow **Vercel Production Deploy** em Actions.
- Esperado: job verde; novo deployment em Vercel com status **Ready**.

```bash
# Opcional: disparar deploy via push
git commit --allow-empty -m "chore: trigger vercel deploy"
git push origin main
```

---

## Tarefa 2 — Reconectar Git na Vercel (recomendado)

### Objetivo
Restaurar deploy nativo da Vercel em push (redundante com GitHub Action, mas útil).

### Passos

1. [Vercel Dashboard](https://vercel.com) → projeto **financial-advisor**.
2. **Settings** → **Git**.
3. Confirmar repositório: `Fabianocolombini/Financial_Advisor`.
4. **Production Branch:** `main`.
5. Se desconectado: **Connect Git Repository** → GitHub → autorizar → selecionar o repo.
6. **Deployments** → verificar que novos pushes geram build.

---

## Tarefa 3 — Variáveis Vercel Production (checklist)

Confirmar em Vercel → **financial-advisor** → **Settings** → **Environment Variables** → **Production**:

| Variável | Obrigatório | Notas |
|----------|-------------|--------|
| `DATABASE_URL` | Sim | Neon pooler URL |
| `AUTH_SECRET` | Sim | `openssl rand -base64 32` |
| `AUTH_ENABLED` | Sim | `true` |
| `AUTH_URL` | Sim | `https://financial-advisor-sable.vercel.app` |
| `AUTH_GOOGLE_ID` | Sim | Google OAuth |
| `AUTH_GOOGLE_SECRET` | Sim | Google OAuth |
| `CRON_SECRET` | Sim | Crons `/api/cron/*` |
| `FRED_API_KEY` | Sim | Cron ingest-market |
| `BLOB_READ_WRITE_TOKEN` | Sim | Motor snapshot na app (opcional local) |

**Google OAuth redirect URI (produção):**
`https://financial-advisor-sable.vercel.app/api/auth/callback/google`

Após alterar env: **Redeploy** Production.

---

## Tarefa 4 — Secrets GitHub Actions (motor)

Repositório → **Settings** → **Secrets** → **Actions**:

| Secret | Uso |
|--------|-----|
| `VERCEL_TOKEN` | Deploy app (Tarefa 1) |
| `FRED_API_KEY` | Workflow Motor Daily |
| `BLOB_READ_WRITE_TOKEN` | Upload SQLite + `dashboard-snapshot.json` |

### Disparar Motor Daily manualmente

**Opção A (UI):** GitHub → **Actions** → **Motor Daily** → **Run workflow** → branch `main`.

**Opção B (sem UI — Claude Web / agent):** ver [COMANDO_CLAUDE_WEB_MOTOR_DAILY.md](COMANDO_CLAUDE_WEB_MOTOR_DAILY.md).

**Opção C (push tag):** commit com `[motor-daily]` na mensagem dispara o job em push em `main`:

```bash
git commit --allow-empty -m "chore: [motor-daily] trigger pipeline"
git push origin main
```

**Opção D (curl):** se `GITHUB_MOTOR_DISPATCH_TOKEN` está na Vercel:

```bash
npm run motor:trigger-daily   # usa CRON_SECRET ou GITHUB_MOTOR_DISPATCH_TOKEN no env
```

Esperado nos logs:
- `Download OK` ou blob ausente (1ª vez)
- `export_dashboard` OK
- `Upload OK` + snapshot

---

## Tarefa 5 — Verificação de produção (smoke test)

Executar após deploy bem-sucedido:

```bash
# 1) Site responde
curl -sI https://financial-advisor-sable.vercel.app | head -5

# 2) Auth redirect (sem sessão)
curl -sI https://financial-advisor-sable.vercel.app/patrimonio | grep -i location

# 3) Cron protegido (sem secret = 401)
curl -s -o /dev/null -w "%{http_code}\n" \
  https://financial-advisor-sable.vercel.app/api/cron/ingest-market

# 4) Cron com secret (substituir CRON_SECRET)
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://financial-advisor-sable.vercel.app/api/cron/ingest-market | head -c 200
```

### UI (browser, aba anônima)

1. Login Google em `/auth/signin`.
2. **Home** — título "Home", tabelas watchlist por classe (não "Overview" com cards Net Worth).
3. Nav: **Home · Markets · My Wallet · Budget**.
4. Busca símbolos — header **não desaparece** ao abrir Cash / Treasuries.
5. **Markets** — mesma watchlist com performance 1D.
6. **My Wallet** — net worth, goals, budget.

---

## Tarefa 6 — Deploy manual de emergência (CLI)

Se GitHub Action e Git Vercel falharem:

```bash
cd /path/to/Financial_Advisor
npm ci
vercel link          # projeto financial-advisor se necessário
vercel --prod
```

Requer login Vercel CLI (`vercel login`) na máquina local.

---

## Prompt sugerido para Claude Web

Copie e cole (ajuste se já fez alguma tarefa):

```
Você está operando o projeto Financial Advisor.

Repositório: Fabianocolombini/Financial_Advisor (branch main)
Produção: https://financial-advisor-sable.vercel.app
Vercel project: financial-advisor

Siga o guia em docs/GUIA_OPERACAO_CLAUDE_WEB.md neste repositório e execute:

1. Confirmar se VERCEL_TOKEN existe nos GitHub Secrets; se não, instruir criação passo a passo.
2. Verificar integração Git Vercel → GitHub (Settings → Git, branch main).
3. Listar variáveis Vercel Production obrigatórias e indicar quais podem estar vazias.
4. Disparar ou verificar último run de:
   - CI (ci.yml)
   - Vercel Production Deploy (vercel-deploy.yml)
   - Motor Daily (motor-daily.yml)
5. Confirmar que produção mostra UI nova (Home, My Wallet, Markets) e não layout antigo Overview.
6. Reportar: URLs de deployment, commit SHA em produção, e qualquer secret faltando.

Não commitar secrets. Não expor valores de tokens em resposta.
```

---

## Referências no repo

| Doc | Conteúdo |
|-----|----------|
| [CLOUD_SETUP.md](CLOUD_SETUP.md) | Setup inicial nuvem |
| [CLOUD_VERIFICATION_CHECKLIST.md](CLOUD_VERIFICATION_CHECKLIST.md) | Checklist completo + queries Neon |
| [COMANDO_CLAUDE_WEB_MOTOR_DAILY.md](COMANDO_CLAUDE_WEB_MOTOR_DAILY.md) | Prompt para disparar Motor Daily sem o usuário |
| `.github/workflows/vercel-deploy.yml` | Deploy em push |
| `.github/workflows/motor-daily.yml` | Motor diário |
| `.cursor/rules/auto-commit-deploy.mdc` | Regra: commit+push após entregas |

---

## Critério de “tudo OK”

- [ ] Push em `main` → workflow **Vercel Production Deploy** verde
- [ ] Vercel **Deployments** mostra build recente (< 15 min após push)
- [ ] `financial-advisor-sable.vercel.app` mostra **Home** + **My Wallet** no nav
- [ ] Login Google funciona
- [ ] Motor Daily rodou nas últimas 24–48 h (ou manual hoje)
- [ ] Blob contém `motor/dashboard-snapshot.json` (scores na Home)

---

*Última atualização: alinhado com commits `b26c970` (UI) e `c1a6747` (vercel-deploy workflow).*
