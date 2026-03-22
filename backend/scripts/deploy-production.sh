#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONFIG="${WRANGLER_PRODUCTION_CONFIG:-wrangler.production.toml}"
if [[ ! -f "$CONFIG" ]]; then
  echo "未找到 $CONFIG。请执行: cp wrangler.production.toml.example wrangler.production.toml"
  echo "并填写 D1 database_id、R2 bucket 名等。详见 docs/deployment/backend-production.md"
  exit 1
fi

npm run typecheck
npm run test
exec npx wrangler deploy --config "$CONFIG"
