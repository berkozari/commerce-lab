#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

[[ -f docker/compose.dev.yml && -f docker/compose.full-dev.yml ]] || {
  echo 'Missing CommerceLab Docker Compose files' >&2; exit 1;
}
[[ -f docker/.env ]] || { echo 'Missing existing docker/.env; do not replace your DB password' >&2; exit 1; }
command -v docker >/dev/null || { echo 'Docker CLI not found' >&2; exit 1; }

action="${1:-}"
case "$action" in
  up)
    node scripts/ec015-2-prepare-env.mjs
    node scripts/ec015-2-apply-vite-config.mjs
    [[ -f docker/.env.full ]] || { echo 'No generated full-stack environment file' >&2; exit 1; }
    # Check syntax without printing interpolated secrets.
    docker compose --env-file docker/.env --env-file docker/.env.full \
      -f docker/compose.dev.yml -f docker/compose.full-dev.yml config --quiet
    # Existing PostgreSQL-only setup and named volume are preserved.
    docker compose --env-file docker/.env -f docker/compose.dev.yml up -d postgres
    docker compose --env-file docker/.env --env-file docker/.env.full \
      -f docker/compose.dev.yml -f docker/compose.full-dev.yml up -d --build api web
    bash scripts/ec015-2-smoke.sh
    ;;
  smoke)
    bash scripts/ec015-2-smoke.sh
    ;;
  ps|logs|down)
    [[ -f docker/.env.full ]] || { echo 'Missing docker/.env.full. Run up first.' >&2; exit 1; }
    if [[ "$action" == logs ]]; then
      docker compose --env-file docker/.env --env-file docker/.env.full \
        -f docker/compose.dev.yml -f docker/compose.full-dev.yml logs --tail=80 api web
    elif [[ "$action" == down ]]; then
      # Never remove the named PostgreSQL volume (-v is intentionally absent).
      docker compose --env-file docker/.env --env-file docker/.env.full \
        -f docker/compose.dev.yml -f docker/compose.full-dev.yml stop api web
      echo 'API/Web stopped. PostgreSQL remains available for native development and isolated tests.'
    else
      docker compose --env-file docker/.env --env-file docker/.env.full \
        -f docker/compose.dev.yml -f docker/compose.full-dev.yml ps
    fi
    ;;
  *)
    echo 'Usage: bash scripts/ec015-2-dev-stack.sh {up|smoke|ps|logs|down}' >&2
    exit 2
    ;;
esac
