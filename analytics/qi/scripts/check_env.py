#!/usr/bin/env python3
"""Pre-flight check for required QI environment variables."""

import os
import sys


GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
RESET = "\033[0m"

REQUIRED_VARS = (
    ("DATABASE_URL", "Connection string PostgreSQL"),
    ("POLYGON_API_KEY", "Chave Polygon REST API"),
    ("FMP_API_KEY", "Chave Financial Modeling Prep"),
    ("FRED_API_KEY", "Chave FRED"),
)

OPTIONAL_DEFAULTS = (
    ("QI_INGEST_PHASE", "all", "Fase de ingestao"),
    ("QI_MIN_FRED_PCT", "0.7", "Cobertura minima FRED"),
    ("QI_FRED_UNIVERSE", "core", "Universo FRED"),
    ("QI_BATCH_SIZE", "50", "Batch para Polygon/FMP"),
    ("QI_MAX_RETRIES", "3", "Tentativas maximas por requisicao"),
)


def _ok(msg: str) -> None:
    print(f"{GREEN}[OK]{RESET} {msg}")


def _missing(msg: str) -> None:
    print(f"{RED}[MISSING]{RESET} {msg}")


def _warn(msg: str) -> None:
    print(f"{YELLOW}[WARN]{RESET} {msg}")


def main() -> int:
    print("[CHECK] Validando ambiente QI...")
    print()

    missing = []
    blocking_errors = 0

    for key, description in REQUIRED_VARS:
        value = (os.environ.get(key) or "").strip()
        if value:
            _ok(f"{key} presente ({description})")
        else:
            _missing(f"{key} ausente ({description})")
            missing.append(key)

    database_url = (os.environ.get("DATABASE_URL") or "").strip()
    if database_url:
        if not (
            database_url.startswith("postgresql://")
            or database_url.startswith("postgres://")
        ):
            print(
                f"{RED}[INVALID]{RESET} DATABASE_URL deve iniciar com "
                "postgresql:// ou postgres://"
            )
            blocking_errors += 1
        if "neon.tech" in database_url:
            _warn(
                "DATABASE_URL parece Neon. Para ingestoes longas no dev, "
                "prefira PostgreSQL local."
            )

    print()
    print("[INFO] Variaveis opcionais (com default efetivo):")
    for key, default, description in OPTIONAL_DEFAULTS:
        value = (os.environ.get(key) or "").strip() or default
        print(f"  - {key}={value} ({description}, default={default})")

    total_blocking = len(missing) + blocking_errors
    print()
    if total_blocking == 0:
        print(f"{GREEN}✓ Ambiente pronto{RESET}")
        return 0

    print(
        f"{RED}✗ {total_blocking} variavel(is) ausente(s)/invalida(s) "
        f"- pipeline bloqueado{RESET}"
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
