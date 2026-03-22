#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "用法: $0 <WORKER_BASE_URL>"
  echo "示例: $0 https://ai-task-assistant-production.xxx.workers.dev"
  exit 1
fi

BASE="${1%/}"
paths=(/ /health /health/llm /health/db /health/qdrant /health/memory /health/serper /health/storage)

for p in "${paths[@]}"; do
  url="${BASE}${p}"
  echo "=== GET ${url}"
  code=$(curl -sS -o /tmp/wr-health.json -w "%{http_code}" "$url" || true)
  echo "HTTP ${code}"
  if [[ -s /tmp/wr-health.json ]]; then
    head -c 800 /tmp/wr-health.json
    echo
  fi
done
