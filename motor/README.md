# Motor — Python + SQLite

## Etapa 1 — Gestão de fontes (foco atual)

Ingestão e teste de conexão conforme `config/fontes_manifest.json` e `docs/classes-ativos-indicadores-fontes.md`.

```bash
pip install -r motor/requirements.txt
npm run motor:test-fontes   # smoke: FRED, yfinance, EDGAR, World Bank, ECB
npm run motor:fontes        # ingest completo do manifesto
```

## Etapa 2+ — Score por aba

```bash
npm run motor:test
npm run motor:pipeline -- --aba taxas
npm run motor:report -- --aba credito_alternativo
```

## Estrutura

- `config/fontes_manifest.json` — classes, indicadores, fontes (Etapa 1)
- `config/abas/` — score por aba (Etapa 2+)
- `data/historico.db` — SQLite (gitignored)
- `output/` — relatórios `.md`

## Nuvem (produção)

Em produção o motor **não** roda na máquina local. O workflow GitHub Actions [`.github/workflows/motor-daily.yml`](../.github/workflows/motor-daily.yml) executa diariamente às 06:00 UTC:

1. Baixa `historico.db` do Vercel Blob
2. `motor/scripts/run_daily.py` (fontes + pipeline de todas as abas)
3. Reenvia SQLite e relatórios ao Blob

Ver [docs/CLOUD_SETUP.md](../docs/CLOUD_SETUP.md) para secrets e verificação.
