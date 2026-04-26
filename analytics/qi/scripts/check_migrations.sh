#!/bin/bash

set -u

echo "[CHECK] Verificando status das migrations Prisma..."
echo

output="$(npx prisma migrate status 2>&1)"
status=$?

echo "$output"
echo

if [[ "$output" == *"have not yet been applied"* ]] || \
   [[ "$output" == *"following migration(s) have not been applied"* ]] || \
   [[ "$output" == *"pending"* ]]; then
  echo "  ✗ Migration(s) pendente(s) encontrada(s)."
  echo
  echo "  Para aplicar, rode:"
  echo "    npx prisma migrate deploy        # producao/staging"
  echo "    npx prisma migrate dev           # desenvolvimento local"
  echo
  echo "[BLOQUEANTE] Pipeline nao deve ser iniciado antes da migration."
  exit 1
fi

if [ $status -ne 0 ]; then
  echo "  ✗ Nao foi possivel validar migrations (erro no comando Prisma)."
  echo "[BLOQUEANTE] Corrija o erro acima antes de iniciar o pipeline."
  exit 1
fi

echo "  ✓ Sem migrations pendentes."
exit 0
