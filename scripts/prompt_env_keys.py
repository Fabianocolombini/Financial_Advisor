#!/usr/bin/env python3
"""
Pedido interactivo de chaves de API com entrada oculta (máscara no terminal).
Actualiza ou acrescenta POLYGON_API_KEY, FRED_API_KEY e FMP_API_KEY em .env.local.

Uso (na raiz do projecto):
  npm run env:keys
  # ou: python3 scripts/prompt_env_keys.py
"""
from __future__ import annotations

import getpass
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env.local"


def _escape_double_quoted(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def upsert_line(text: str, key: str, value: str) -> str:
    """Substitui KEY=... ou acrescenta ao fim."""
    line = f'{key}="{_escape_double_quoted(value)}"'
    pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
    if pattern.search(text):
        out = pattern.sub(line, text)
    else:
        if text and not text.endswith("\n"):
            text += "\n"
        out = text + line
    return out if out.endswith("\n") else out + "\n"


def main() -> None:
    print(
        "Chaves de API — entrada oculta (não aparece no ecrã). "
        "Cola cada uma e Enter; Enter vazio = não alterar essa chave.\n"
    )
    polygon = getpass.getpass("POLYGON_API_KEY: ").strip()
    fred = getpass.getpass("FRED_API_KEY: ").strip()
    fmp = getpass.getpass("FMP_API_KEY: ").strip()

    if not polygon and not fred and not fmp:
        print("Nada introduzido. Saída.")
        sys.exit(0)

    text = ENV_FILE.read_text(encoding="utf-8") if ENV_FILE.exists() else ""
    if polygon:
        text = upsert_line(text, "POLYGON_API_KEY", polygon)
    if fred:
        text = upsert_line(text, "FRED_API_KEY", fred)
    if fmp:
        text = upsert_line(text, "FMP_API_KEY", fmp)

    ENV_FILE.write_text(text, encoding="utf-8")
    print(f"\nActualizado: {ENV_FILE}")


if __name__ == "__main__":
    main()
