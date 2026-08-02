#!/usr/bin/env bash
# Dispara Motor Daily na nuvem (GitHub Actions) sem abrir o GitHub UI.
#
# Opção A — Vercel cron (requer env na Production):
#   CRON_SECRET, GITHUB_MOTOR_DISPATCH_TOKEN, GITHUB_REPO
#
# Opção B — GitHub API direta (requer PAT com scope workflow):
#   GITHUB_MOTOR_DISPATCH_TOKEN, GITHUB_REPO
#
# Opção C — commit vazio com tag na mensagem (sempre funciona após push trigger no workflow):
#   git commit --allow-empty -m "chore: [motor-daily] trigger pipeline"
#   git push origin main
#
set -euo pipefail

APP_URL="${APP_URL:-https://financial-advisor-sable.vercel.app}"
REPO="${GITHUB_REPO:-Fabianocolombini/Financial_Advisor}"

if [[ -n "${CRON_SECRET:-}" ]]; then
  echo "[trigger] Via Vercel /api/cron/motor ..."
  curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" "${APP_URL}/api/cron/motor"
  echo ""
  exit 0
fi

if [[ -n "${GITHUB_MOTOR_DISPATCH_TOKEN:-}" ]]; then
  owner="${REPO%%/*}"
  name="${REPO##*/}"
  echo "[trigger] Via GitHub API motor-daily.yml ..."
  curl -fsS -X POST \
    -H "Authorization: Bearer ${GITHUB_MOTOR_DISPATCH_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/${owner}/${name}/actions/workflows/motor-daily.yml/dispatches" \
    -d '{"ref":"main"}'
  echo ""
  exit 0
fi

echo "Configure CRON_SECRET (Vercel) ou GITHUB_MOTOR_DISPATCH_TOKEN + GITHUB_REPO."
echo "Alternativa: commit vazio com [motor-daily] na mensagem e push em main."
exit 1
