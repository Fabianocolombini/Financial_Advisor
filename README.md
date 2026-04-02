# Financial Advisor

Planejamento financeiro pessoal (patrimônio, objetivos, orçamento, transações e comparativo planejado × realizado) com **Next.js 16**, **Prisma**, **PostgreSQL** e **Auth.js** (Google).

## Configuração

1. Siga o guia detalhado em **[docs/SETUP.md](docs/SETUP.md)** (Neon, OAuth, URIs de redirecionamento).
2. Copie `.env.example` para `.env.local` e preencha `DATABASE_URL`, `AUTH_SECRET` e credenciais Google OAuth.
3. Aplique o schema ao banco:

```bash
npx prisma migrate dev
```

4. Suba o app:

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). O painel exige login.

## Deploy (Vercel)

Conecte o repositório GitHub e defina as mesmas variáveis de ambiente. O arquivo [`vercel.json`](vercel.json) define `buildCommand` como `npm run build:vercel` (migrations + build). Se preferir, sobrescreva no painel da Vercel.

Detalhes de API, segurança e convenções estão em [`CLAUDE.md`](CLAUDE.md).

## Qualidade

```bash
npm run lint
npm run test
```
