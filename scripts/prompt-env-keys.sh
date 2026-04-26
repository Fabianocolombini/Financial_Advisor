#!/usr/bin/env bash
# Atalho: pede chaves com máscara e grava em .env.local
set -euo pipefail
cd "$(dirname "$0")/.."
exec python3 scripts/prompt_env_keys.py
