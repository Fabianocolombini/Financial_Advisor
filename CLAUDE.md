@AGENTS.md

# Financial Advisor — contexto do projeto

Aplicação web para planejamento financeiro pessoal (visão de patrimônio, objetivos e orçamento). Stack: **Next.js 16 (App Router)**, **React 19**, **TypeScript**, **Tailwind CSS 4**, **PostgreSQL** via **Prisma 6**, **Auth.js (next-auth v5)** com Google OAuth.

Guia passo a passo (Neon, Google OAuth, URIs de callback): **[docs/SETUP.md](docs/SETUP.md)**.

## Variáveis de ambiente

Copie [`.env.example`](.env.example) para `.env.local` e preencha (veja também [docs/SETUP.md](docs/SETUP.md)):

| Variável | Obrigatório | Uso |
|----------|-------------|-----|
| `DATABASE_URL` | Sim | PostgreSQL (ex.: Neon) |
| `AUTH_SECRET` | Sim | Segredo de sessão/cookie (`openssl rand -base64 32`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Para login | OAuth Google |
| `AUTH_URL` | Produção recomendado | URL pública do site (Vercel costuma inferir) |
| `FRED_API_KEY` | Ingestão macro | API FRED (gratuita com cadastro) |
| `CRON_SECRET` | Ingestão agendada | `Authorization: Bearer` em `/api/cron/ingest-market` |

## Banco e Prisma

```bash
npx prisma migrate dev    # desenvolvimento (aplica migrations + gera client)
npx prisma studio         # UI dos dados
```

- **Deploy (Vercel)**: o repositório inclui [`vercel.json`](vercel.json) com `buildCommand` = `npm run build:vercel` (migrate + generate + build). Confirme as env vars no painel da Vercel.
- **Neon + pooler**: se `migrate deploy` falhar com PgBouncer, use a connection string **direta** (não pooled) em `DATABASE_URL` só para rodar migrations, ou configure `directUrl` no `schema.prisma` conforme [documentação Prisma + Neon](https://www.prisma.io/docs/guides/database/neon).

**Mercado (referência):** modelos `MarketSeries`, `MarketObservation` em [`prisma/schema.prisma`](prisma/schema.prisma); ingestão em [`lib/market/ingest.ts`](lib/market/ingest.ts) (FRED + Yahoo chart). Não contêm dados pessoais.

## APIs REST

Todas exigem sessão (cookie). Respostas `401` se não autenticado. **Sempre filtrar por `userId` da sessão** — nunca confiar em `userId` vindo do cliente.

| Método | Rota |
|--------|------|
| GET, POST | `/api/goals` |
| GET, PATCH, DELETE | `/api/goals/[id]` |
| GET, POST | `/api/balance-items` |
| PATCH, DELETE | `/api/balance-items/[id]` |
| GET, POST | `/api/budget/categories` |
| PATCH, DELETE | `/api/budget/categories/[id]` |
| GET (`?year=&month=`), POST | `/api/budget/entries` |
| PATCH, DELETE | `/api/budget/entries/[id]` |
| GET (`?year=&month=`), POST | `/api/transactions` |
| PATCH, DELETE | `/api/transactions/[id]` |

Auth: `/api/auth/*` (Auth.js).

**Cron (sem sessão de usuário):** `GET /api/cron/ingest-market` com header `Authorization: Bearer <CRON_SECRET>` e `FRED_API_KEY` no servidor. Protegido; não expor o segredo no client.

**Rate limiting:** mutações (`POST`/`PATCH`/`DELETE`) nas rotas acima usam limite simples por IP em [`lib/rate-limit.ts`](lib/rate-limit.ts) (memória do processo; em produção multi-instância considerar Redis/Upstash).

## Convenções

- Rotas em português: `/`, `/objetivos`, `/patrimonio`, `/orcamento`; login em `/auth/signin`. Páginas públicas: `/legal/privacidade`, `/legal/termos`.
- Textos de UI em **pt-BR**.
- Lógica em `lib/`; UI em `components/`; páginas do painel em `app/(dashboard)/` com `AppShell`.
- Valores no banco: `Decimal` (Prisma); na UI usar `lib/format.ts` (BRL).

## Segurança

- Não logar valores financeiros em produção.
- Dados sensíveis: HTTPS, revisar escopos OAuth e políticas de retenção (LGPD).
- Testes automatizados (schemas Zod): `npm run test`. CI: [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
