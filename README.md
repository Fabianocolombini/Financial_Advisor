# Financial Advisor

Planejamento financeiro pessoal (patrimônio, objetivos, orçamento) com **Next.js 16**, **Prisma**, **PostgreSQL** e **Auth.js** (Google).

## Configuração

1. Copie `.env.example` para `.env.local` e preencha `DATABASE_URL`, `AUTH_SECRET` e credenciais Google OAuth.
2. Aplique o schema ao banco:

```bash
npx prisma migrate dev
```

3. Suba o app:

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). O painel exige login.

## Deploy (Vercel)

Defina as mesmas variáveis de ambiente no projeto Vercel. Para aplicar migrations no build, use:

```bash
npm run build:vercel
```

como **Build Command**, ou rode `npx prisma migrate deploy` contra o banco de produção antes do deploy.

Detalhes de API, segurança e convenções estão em [`CLAUDE.md`](CLAUDE.md).
