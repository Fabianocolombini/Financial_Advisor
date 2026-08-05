# Motor on-demand (★ watchlist)

Ao dar **★** na busca, a app dispara o workflow **Motor Symbol** no GitHub Actions (~1–2 min por papel).

## Vercel Production (obrigatório para ★ imediato)

| Variável | Valor |
|----------|--------|
| `GITHUB_REPO` | `Fabianocolombini/Financial_Advisor` |
| `GITHUB_MOTOR_DISPATCH_TOKEN` | PAT GitHub com scope **repo** + **workflow** |

Criar PAT: GitHub → **Settings** → **Developer settings** → **Fine-grained tokens** → repo `Financial_Advisor` → **Actions: Read and write**.

Vercel → **financial-advisor** → **Settings** → **Environment Variables** → Production → add `GITHUB_MOTOR_DISPATCH_TOKEN`.

Redeploy após salvar.

## Sem PAT

Watchlist salva, mas scores do motor só após **Motor Daily** (06:00 UTC ou Run workflow manual).

## Verificar

Dar ★ em um símbolo → mensagem na busca: *"motor pipeline started"*.

GitHub → Actions → **Motor Symbol (on-demand)** → run em progresso.
