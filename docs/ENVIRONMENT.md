# Ambiente local — chaves de API (protegido)

## Onde colocar segredos

Use **um único ficheiro na raiz do repositório:**

| Ficheiro        | Função |
|----------------|--------|
| **`.env.local`** | Chaves reais (FRED, Polygon, DB, etc.). **Nunca commitar.** |
| `.env.example`  | Modelo **sem** segredos — pode ir para o Git. |

O Git ignora `.env.local` (ver [`.gitignore`](../.gitignore)). Copie o exemplo:

```bash
cp .env.example .env.local
# Edite .env.local e preencha as chaves
```

Ou, com **entrada oculta** (máscara no terminal) para Polygon e FRED:

```bash
npm run env:keys
# ou: python3 scripts/prompt_env_keys.py
# ou: ./scripts/prompt-env-keys.sh
```

## Quem lê o quê

- **Next.js** — carrega `.env.local` na raiz automaticamente em `next dev` / build.
- **Python `analytics/qi`** — [`analytics/qi/config.py`](../analytics/qi/config.py) faz `load_dotenv` da **mesma** `.env.local` na raiz (e depois `.env` se existir).

Assim, **FRED**, **Polygon**, **DATABASE_URL**, etc. ficam no **mesmo sítio**.

## Chaves usadas no projecto

| Variável | Serviço | Onde usar |
|----------|---------|-----------|
| `DATABASE_URL` | PostgreSQL | App + Python |
| `FRED_API_KEY` | [FRED API](https://fred.stlouisfed.org/docs/api/api_key.html) | Ingest macro (`qi-macro` TS na Vercel; Python só se incluir `fred` em `QI_INGEST_PHASE`) |
| `POLYGON_API_KEY` | [Polygon.io](https://polygon.io/) | Preços diários → `qi_market_price_daily` (Python) |
| `FMP_API_KEY` | Financial Modeling Prep (opcional) | Fundamentais |
| `CRON_SECRET` | — | Protecção `Bearer` dos `/api/cron/*` |
| `RESEND_API_KEY` | [Resend](https://resend.com) | E-mail diário da carteira (Hold / Buy more / Exit) |
| `WALLET_ALERT_FROM` | Remetente verificado no Resend | Opcional se usar o domínio da conta |
| `AUTH_SECRET`, `AUTH_GOOGLE_*` | Auth.js | Só se `AUTH_ENABLED=true` |

Variáveis `QI_*` (gate FRED, fases de ingest, etc.) estão comentadas em [`.env.example`](../.env.example).

## QI Pipeline: separação de hosts

| Componente | Host | Trigger | O que faz |
|------------|------|---------|-----------|
| `ingest-market` | Vercel | Cron 11:00 UTC | Dados legacy (`MarketSeries` / `MarketObservation`) |
| `qi-macro` | Vercel | Cron 11:15 UTC | FRED macro → `QiMacroSeries` / `QiMacroSeriesPoint` (fonte única de FRED em produção) |
| `run_ingest_daily` | Host Python | APScheduler 11:30 UTC (ver `analytics/qi/scheduler.py`) | Polygon OHLCV + FMP (`QI_INGEST_PHASE=polygon,fmp`) |
| `run_universe_weekly` | Host Python | APScheduler domingo 12:00 UTC | Rebuild do universo por setor |
| `run_analysis` | Host Python | APScheduler 12:30 UTC | Regime + rotação setorial + recomendações |

**Regra:** em produção, FRED fica a cargo do cron TS `qi-macro`. O job Python deve usar `QI_INGEST_PHASE=polygon,fmp` para não duplicar chamadas FRED.

## Produção (Vercel)

Defina as **mesmas** variáveis em **Settings → Environment Variables** do projecto (sem ficheiro `.env.local` no servidor).

**Guia completo de nuvem** (Google OAuth, crons, motor Python via GitHub Actions, Vercel Blob): [CLOUD_SETUP.md](CLOUD_SETUP.md).

## O que não fazer

- Não commitar `.env.local`, `.env`, nem ficheiros com nomes tipo `.env.secrets` se os criar à mão sem regra no `.gitignore`.
- Não colar chaves em issues, chats públicos ou screenshots.
