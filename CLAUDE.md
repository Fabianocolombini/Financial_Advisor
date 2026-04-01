@AGENTS.md

# Financial Advisor — contexto do projeto

Aplicação web para planejamento financeiro pessoal (visão de patrimônio, objetivos e orçamento). Stack: **Next.js 16 (App Router)**, **React 19**, **TypeScript**, **Tailwind CSS 4**, **PostgreSQL** via **Prisma 6**, **Auth.js (next-auth v5)** com Google OAuth.

## Variáveis de ambiente

Copie [`.env.example`](.env.example) para `.env.local` e preencha:

| Variável | Obrigatório | Uso |
|----------|-------------|-----|
| `DATABASE_URL` | Sim | PostgreSQL (ex.: Neon) |
| `AUTH_SECRET` | Sim | Segredo de sessão/cookie (`openssl rand -base64 32`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Para login | OAuth Google |
| `AUTH_URL` | Produção recomendado | URL pública do site (Vercel costuma inferir) |

## Banco e Prisma

```bash
npx prisma migrate dev    # desenvolvimento (aplica migrations + gera client)
npx prisma studio         # UI dos dados
```

- **Deploy (Vercel)**: no painel, use **Build Command** `npm run build:vercel` para aplicar `prisma migrate deploy` antes do `next build`, ou rode migrate manualmente apontando para o mesmo banco.
- **Neon + pooler**: se `migrate deploy` falhar com PgBouncer, use a connection string **direta** (não pooled) em `DATABASE_URL` só para rodar migrations, ou configure `directUrl` no `schema.prisma` conforme [documentação Prisma + Neon](https://www.prisma.io/docs/guides/database/neon).

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

Auth: `/api/auth/*` (Auth.js).

## Convenções

- Rotas em português: `/`, `/objetivos`, `/patrimonio`, `/orcamento`; login em `/auth/signin`.
- Textos de UI em **pt-BR**.
- Lógica em `lib/`; UI em `components/`; páginas do painel em `app/(dashboard)/` com `AppShell`.
- Valores no banco: `Decimal` (Prisma); na UI usar `lib/format.ts` (BRL).

## Segurança

- Não logar valores financeiros em produção.
- Dados sensíveis: HTTPS, revisar escopos OAuth e políticas de retenção (LGPD).
