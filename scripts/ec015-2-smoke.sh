#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
[[ -f docker/.env.full ]] || { echo 'Missing docker/.env.full' >&2; exit 1; }
command -v curl >/dev/null || { echo 'curl required for smoke test' >&2; exit 1; }

# Never print Compose config or secrets into the report.
compose=(docker compose --env-file docker/.env --env-file docker/.env.full \
  -f docker/compose.dev.yml -f docker/compose.full-dev.yml)

echo '=== EC-015.2 smoke checks ==='
"${compose[@]}" ps
for target in \
  'API readiness|http://127.0.0.1:3000/api/v1/health/ready' \
  'Vite frontend|http://127.0.0.1:5173/' \
  'Web-to-API reverse proxy|http://127.0.0.1:5173/api/v1/health/ready'; do
  name="${target%%|*}"; url="${target#*|}"
  ready=0
  for _attempt in {1..15}; do
    if curl --fail --silent --max-time 5 --output /dev/null "$url"; then
      ready=1
      break
    fi
    sleep 2
  done
  if [[ "$ready" == 1 ]]; then
    echo "PASS | $name"
  else
    echo "FAIL | $name | $url" >&2
    exit 1
  fi
done

echo 'EC-015.2 FULL-STACK DOCKER DEV SMOKE PASS'
