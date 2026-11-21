#!/usr/bin/env bash
# EC-014.5 dedicated local full-stack E2E: no dev/test DB writes, no reset, no commit.
set -euo pipefail

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
cd "$repo_root"

[[ -f package.json && -f apps/api/.env && -f apps/web/e2e/live.e2e.ts ]] || fail 'Run from an installed CommerceLab repository with apps/api/.env.'
[[ -f scripts/ec014-5-live-db-prepare.sh && -f scripts/ec014-5-e2e-regression.sh ]] || fail 'Original EC-014.5 scripts are missing.'
for tool in node docker pnpm; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ "$(git branch --show-current)" == 'feature/testing-quality-assurance' ]] || fail 'Expected feature/testing-quality-assurance branch.'

pg_container="${EC014_E2E_PG_CONTAINER:-commerce-lab-dev-postgres-1}"
[[ "$pg_container" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || fail 'Invalid Docker container name.'
[[ "$(docker inspect -f '{{.State.Running}}' "$pg_container" 2>/dev/null)" == 'true' ]] || fail "Postgres container '$pg_container' is not running."

# Verify this is the known local Docker PostgreSQL port; never modify an arbitrary remote DB.
port_mappings="$(docker port "$pg_container" 5432/tcp 2>/dev/null)" || fail 'Could not verify PostgreSQL port mapping.'
printf '%s\n' "$port_mappings" | grep -Eq ':5433$' || fail 'Expected Docker PostgreSQL host port 5433.'

# Read only the established development URL (without printing credentials) and derive
# a DIFFERENT, strictly named dedicated E2E target. Do not trust an arbitrary env override.
EC014_E2E_DATABASE_URL="$({ env -u DATABASE_URL node --env-file=apps/api/.env - <<'NODE'
const raw = process.env.DATABASE_URL;
if (!raw) { console.error('Missing apps/api/.env DATABASE_URL'); process.exit(1); }
let url;
try { url = new URL(raw); } catch { console.error('Invalid DATABASE_URL'); process.exit(1); }
const allowed = ['postgresql:', 'postgres:'].includes(url.protocol)
  && ['127.0.0.1', 'localhost'].includes(url.hostname)
  && url.port === '5433'
  && url.username === 'commercelab'
  && url.pathname === '/commercelab_dev'
  && url.hash === ''
  && [...url.searchParams.keys()].every(key => key === 'schema')
  && (!url.searchParams.has('schema') || url.searchParams.get('schema') === 'public');
if (!allowed) {
  console.error('Refusing to derive E2E URL: expected local commercelab_dev on port 5433, user commercelab.');
  process.exit(1);
}
url.pathname = '/commercelab_e2e_browser';
process.stdout.write(url.toString());
NODE
} )" || fail 'Could not validate and derive isolated E2E URL.'
export EC014_E2E_DATABASE_URL

# Use constant database identifier, not input-derived SQL. Does NOT drop/reset existing DB.
db='commercelab_e2e_browser'
exists="$(docker exec "$pg_container" psql -U commercelab -d postgres -X -v ON_ERROR_STOP=1 -At -c "SELECT 1 FROM pg_database WHERE datname = 'commercelab_e2e_browser'" | tr -d '\r\n')" || fail 'Could not query PostgreSQL database list.'
if [[ "$exists" == '1' ]]; then
  printf 'Dedicated E2E database already exists: %s (no reset)\n' "$db"
elif [[ -z "$exists" ]]; then
  printf 'Creating new dedicated E2E database: %s\n' "$db"
  docker exec "$pg_container" createdb -U commercelab -O commercelab "$db" || fail 'Could not create dedicated E2E database.'
else
  fail 'Unexpected PostgreSQL database lookup result.'
fi
confirmed="$(docker exec "$pg_container" psql -U commercelab -d "$db" -X -v ON_ERROR_STOP=1 -At -c 'SELECT current_database()' | tr -d '\r\n')" || fail 'Cannot connect to E2E database.'
[[ "$confirmed" == "$db" ]] || fail 'PostgreSQL did not confirm the dedicated database.'

printf '\n[1/2] Applying migrations and seed ONLY to %s...\n' "$db"
bash scripts/ec014-5-live-db-prepare.sh
printf '\n[2/2] Running one real API + PostgreSQL Playwright test...\n'
EC014_E2E_LIVE=1 bash scripts/ec014-5-e2e-regression.sh
printf '\nEC-014.5 FULL-STACK E2E PASS (dedicated database: %s).\n' "$db"
