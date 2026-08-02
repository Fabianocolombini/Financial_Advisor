# Comando Claude Web — disparar Motor Daily (sem ação do usuário)

Copie **todo o bloco** abaixo no Claude Web (com acesso ao repositório GitHub ou terminal).

---

## Prompt

```
Projeto: Fabianocolombini/Financial_Advisor (branch main)
Produção: https://financial-advisor-sable.vercel.app

Tarefa: DISPARAR o workflow GitHub Actions "Motor Daily" AGORA para popular o snapshot do Markets (Etapa 1A).

O usuário NÃO executa comandos manualmente — você deve fazer.

Ordem de tentativa:

1) GitHub UI (se tiver browser)
   - Actions → Motor Daily → Run workflow → branch main → Run workflow
   - Confirmar job "motor" iniciado (não só workflow skipped)

2) Se tiver `gh` autenticado:
   gh workflow run motor-daily.yml --ref main
   gh run list --workflow=motor-daily.yml --limit 1

3) Se tiver Vercel CLI linkado ao projeto financial-advisor:
   vercel env pull .env.vercel.tmp --environment=production --yes
   source .env.vercel.tmp
   curl -s -H "Authorization: Bearer $CRON_SECRET" \
     https://financial-advisor-sable.vercel.app/api/cron/motor
   (Só funciona se GITHUB_MOTOR_DISPATCH_TOKEN também está na Vercel.)
   rm -f .env.vercel.tmp

4) SEMPRE FUNCIONA (push trigger):
   git checkout main && git pull
   git commit --allow-empty -m "chore: [motor-daily] trigger pipeline"
   git push origin main
   O workflow motor-daily.yml roda quando a mensagem do commit contém [motor-daily].

5) Monitorar até upload Blob:
   - Logs: export catalog → fontes → macro abas → top-90% → validate_abas → blob upload
   - Timeout: 180 min (primeira run pode levar 1–3 h)

6) Verificar snapshot (após job verde):
   npm run motor:verify-cloud-snapshot
   (precisa BLOB_READ_WRITE_TOKEN no ambiente)

Reportar: URL da run Actions, status final, tickerCount no snapshot, erros se falhou.

NÃO expor valores de secrets (CRON_SECRET, tokens, DATABASE_URL).
```

---

## Secrets necessários (GitHub Actions)

| Secret | Obrigatório |
|--------|-------------|
| `FRED_API_KEY` | Sim |
| `BLOB_READ_WRITE_TOKEN` | Sim |

## Vercel Production (app lê snapshot)

| Variável | Obrigatório |
|----------|-------------|
| `BLOB_READ_WRITE_TOKEN` | Sim |

## Opcional (cron / ★ on-demand)

| Variável | Onde | Uso |
|----------|------|-----|
| `GITHUB_MOTOR_DISPATCH_TOKEN` | Vercel + GitHub PAT | `/api/cron/motor` e workflow motor-symbol |
| `GITHUB_REPO` | Vercel | `Fabianocolombini/Financial_Advisor` |
| `CRON_SECRET` | Vercel | Auth do `/api/cron/motor` |

Criar PAT: GitHub → Settings → Developer settings → Fine-grained token → repo Financial_Advisor → **Actions: Read and write**.

---

Ver também: [ETAPA_1A_TESTE.md](ETAPA_1A_TESTE.md), [GUIA_OPERACAO_CLAUDE_WEB.md](GUIA_OPERACAO_CLAUDE_WEB.md).
