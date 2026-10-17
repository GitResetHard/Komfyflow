#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
DEST=${1:-../komfyflow-source.tar.gz}
# Do not include credentials, installed dependencies, generated Next output or QA state.
tar --exclude=node_modules --exclude=.next --exclude=.git --exclude=.env \
  --exclude='.env.*.local' --exclude=.data --exclude=storage --exclude=coverage \
  --exclude='*.tsbuildinfo' --exclude='*.log' --exclude='*.tar.gz' \
  --exclude='*.zip' --exclude=playwright-report --exclude=test-results \
  -czf "$DEST" .
printf 'Source archive: %s\n' "$DEST"
