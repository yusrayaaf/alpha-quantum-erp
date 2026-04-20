#!/usr/bin/env bash
# Quick push to GitHub — Vercel auto-deploys from git
set -euo pipefail
cd "$(dirname "$0")"
git add -A
MSG="${1:-update: $(date '+%Y-%m-%d %H:%M')}"
git diff --cached --quiet && echo "Nothing to commit" && exit 0
git commit -m "$MSG"
git push origin main
echo "✅ Pushed — Vercel deploy starting (~30s)"
