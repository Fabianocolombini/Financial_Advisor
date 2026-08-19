# Comando Claude Web — atualizar Resend (Daily Digest)

Use quando o assistente tem **apenas browser** (Resend + Vercel) — sem terminal, `git`, `gh` ou `vercel` CLI.

Objetivo: o **Daily Digest** sair de verdade no e-mail de quem clicou **Allow Daily Digest by email** em **Profile** (`/settings`).

---

## Prompt (copiar bloco inteiro)

```
Projeto: Fabianocolombini/Financial_Advisor (branch main)
Produção: https://atlascapital.markets
Alias: https://financial-advisor-sable.vercel.app
Vercel: team fabianocolombinis-projects → projeto atlas-capital
(se a UI mostrar financial-advisor, é o mesmo app)

Contexto: Daily Digest (página /homing) já está em produção. O e-mail weekday
(/api/cron/wallet-alerts às 21:30 UTC, seg–sex) usa Resend. A chave
RESEND_API_KEY já existe em Production. O envio falha porque o From não
casa com um domínio Verified no Resend. Quem recebe: só User.dailyDigestEmail=true
(botão Allow em Profile /settings), para o e-mail do login Google.

FERRAMENTAS: browser Resend + Vercel (+ opcional DNS do domínio).
SEM terminal, git, gh, vercel CLI. SEM expor API keys, CRON_SECRET, tokens.

TAREFAS (ordem):

─── A) RESEND — domínio ───
1. Abrir https://resend.com/domains
2. Listar domínios e o Status de cada um (Verified / Pending / Failed).
   Procurar: atlascapital.markets e/ou send.atlascapital.markets
3. Se NENHUM está Verified:
   - Add domain (preferir o subdomínio que o Resend sugerir, em geral send.atlascapital.markets)
   - Copiar os records DNS que o Resend mostrar (DKIM CNAME + SPF TXT)
   - Abrir o DNS de atlascapital.markets (Vercel Domains, ou o registrar)
   - Criar os records EXATOS (nome/host/valor) que o Resend pediu
   - Voltar no Resend → Verify
   - Esperar até Status = Verified (pode levar minutos)
4. Anotar o domínio Verified EXATO (apex vs send.). O From tem de usar esse host.

NÃO inventar records. Só os que o Resend mostra nesta conta.

─── B) FROM tem de casar com o domínio Verified ───
Regra: se o domínio Verified é send.atlascapital.markets, o From NÃO pode ser
@atlascapital.markets. Tem de ser @send.atlascapital.markets.

Valor alvo (ajuste o host ao que ficou Verified):
  Atlas <alerts@send.atlascapital.markets>
ou, se o Verified for o apex:
  Atlas <alerts@atlascapital.markets>

─── C) VERCEL ENV Production ───
Vercel → atlas-capital → Settings → Environment Variables → Production

Confirmar existência (não revelar valores):
  • RESEND_API_KEY     — presente / ausente
  • WALLET_ALERT_FROM  — presente / ausente; se puder Reveal, conferir se o
                         host depois de @ é o domínio Verified do passo A

Se WALLET_ALERT_FROM falta ou o host está errado:
  - Edit / Add WALLET_ALERT_FROM
  - Value: Atlas <alerts@DOMÍNIO-VERIFIED>
  - Environment: Production
  - Save

Se alterou qualquer env → Deployments → Production mais recente → ⋮ → Redeploy
(sem isso o cron continua com o From velho).

─── D) NÃO disparar o cron às cegas ───
O cron só envia para quem clicou Allow. Sem opt-in, emailed=0 mesmo com Resend OK.

Dizer ao usuário (obrigatório no relatório):
  1. Entrar em https://atlascapital.markets/settings
  2. Clicar Allow Daily Digest by email
  3. Clicar Send a test now
  4. Se o teste falhar, copiar a mensagem vermelha (é o JSON do Resend, sem a API key)

Se o usuário já optou in e pediu um envio agora: Vercel → projeto → Cron Jobs
→ /api/cron/wallet-alerts → último run / logs. Procurar JSON
{ ok, users, emailed, skippedRecent, skippedNoEmail, emailConfigured, emailErrors }.
emailErrors com "domain is not verified" = passo A/B ainda errado.

─── E) CRITÉRIO DE PRONTO ───
- Resend domain Status = Verified
- WALLET_ALERT_FROM usa esse host exato
- Production redeployed se o From mudou
- Teste no /settings: “Test sent” (não 502)
- Inbox do Google do usuário recebe Atlas Daily Digest

Reportar: domínio Verified (hostname só), se WALLET_ALERT_FROM estava alinhado
(sim/não, sem colar o valor se tiver a API key misturada), se houve Redeploy,
o que o usuário ainda precisa clicar em Profile (/settings).
NÃO expor RESEND_API_KEY, CRON_SECRET, DATABASE_URL, AUTH_*.
```

---



## O que já está no ar (não recriar)


| Peça                | Estado                                              |
| ------------------- | --------------------------------------------------- |
| Página Daily Digest | `/homing` em produção                               |
| Opt-in              | botão **Allow Daily Digest by email** em `/settings` |
| Teste               | **Send a test now** → `POST /api/digest-email`      |
| Cron                | `30 21 * * 1-5` UTC → `/api/cron/wallet-alerts`     |
| `RESEND_API_KEY`    | já em Vercel Production                             |
| `WALLET_ALERT_FROM` | já em Production — conferir se o host está Verified |


Código: `lib/wallet/send-alert-email.ts` (From = `WALLET_ALERT_FROM`, senão `Atlas <beth.t@example.com>` — esse fallback só entrega na conta Resend).

---



## Erros típicos


| Sintoma                                      | Causa                                  | Correção                   |
| -------------------------------------------- | -------------------------------------- | -------------------------- |
| Teste 502 / `domain is not verified`         | Domínio Pending ou From no host errado | Passos A e B               |
| Cron `emailed: 0`, `users: 0`                | Ninguém clicou Allow                   | Usuário em `/settings`     |
| Cron `users: 1`, `emailed: 0`, `emailErrors` | Resend recusou                         | From ≠ domínio Verified    |
| E-mail só chega na conta Resend              | From = `onboarding@resend.dev`         | Trocar `WALLET_ALERT_FROM` |


---

Ver: [GUIA_OPERACAO_CLAUDE_WEB.md](GUIA_OPERACAO_CLAUDE_WEB.md), [CLOUD_SETUP.md](CLOUD_SETUP.md).