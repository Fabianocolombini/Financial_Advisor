# Setup local — Neon, Prisma e Google OAuth

## 1. PostgreSQL (Neon)

1. Crie um projeto em [neon.tech](https://neon.tech).
2. Copie a connection string (**com SSL**). No painel Neon, use o formato que inclui `sslmode=require` se disponível.
3. Cole em `.env.local` como `DATABASE_URL`.

### Migrations e pooler

Se `npx prisma migrate dev` falhar ao usar a URL do **pooler** (PgBouncer), use temporariamente a connection string **direta** (non-pooled) do Neon só para rodar migrations, ou adicione `directUrl` no `prisma/schema.prisma` conforme a [documentação Prisma + Neon](https://www.prisma.io/docs/guides/database/neon).

## 2. Variáveis de ambiente

```bash
cp .env.example .env.local
```

Preencha no mínimo:

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | URL do Postgres |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` | Client ID OAuth 2.0 |
| `AUTH_GOOGLE_SECRET` | Client secret OAuth 2.0 |
| `FRED_API_KEY` | Séries macro (FRED) — [pedir chave](https://fred.stlouisfed.org/docs/api/api_key.html) |
| `CRON_SECRET` | Protege `GET /api/cron/ingest-market` (Bearer) |

## 3. Google Cloud — OAuth 2.0

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth.
2. Tipo de aplicativo: **Aplicativo da Web**.
3. **URIs de redirecionamento autorizados** (adicione todos os que for usar):

| Ambiente | URI |
|----------|-----|
| Desenvolvimento | `http://localhost:3000/api/auth/callback/google` |
| Produção (Vercel) | `https://SEU_DOMINIO.vercel.app/api/auth/callback/google` |
| Domínio customizado | `https://seudominio.com/api/auth/callback/google` |

4. **Origens JavaScript autorizadas** (opcional para este fluxo server-side, mas útil):

- `http://localhost:3000`
- `https://SEU_DOMINIO.vercel.app`

5. Copie **ID do cliente** e **Chave secreta do cliente** para `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET`.

## 4. Banco de dados local

```bash
npx prisma migrate dev
```

## 5. Rodar o app

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000), faça login com Google e teste criar meta, patrimônio e orçamento.

## Smoke test rápido

- Login redireciona de volta ao painel.
- `/objetivos`: criar e remover meta.
- `/patrimonio`: criar ativo/passivo; patrimônio líquido atualiza.
- `/orcamento`: criar categoria, lançar valor planejado no mês; navegar mês anterior/próximo.

## 6. Dados de mercado (FRED + Yahoo)

Após `npx prisma migrate dev` (tabelas `MarketSeries` / `MarketObservation`):

1. Defina `FRED_API_KEY` e `CRON_SECRET` no `.env.local`.
2. Rode a ingestão manualmente:

```bash
curl -s -H "Authorization: Bearer SEU_CRON_SECRET" http://localhost:3000/api/cron/ingest-market
```

3. Na **Vercel**: adicione as mesmas variáveis; o [`vercel.json`](../vercel.json) agenda cron diário (UTC 11:00). Ajuste o horário no painel se precisar.

Séries padrão (MVP): **FRED `DFF`**, **Yahoo `SPY`** (fechamento diário via chart API não oficial). Amplie em [`lib/market/defaults.ts`](../lib/market/defaults.ts).
