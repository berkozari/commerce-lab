#!/usr/bin/env bash
# CommerceLab EC-013.10.2: opt-in PostgreSQL integration regression.
# Only the authz and checkout *test* databases are allowed. No migrations or commits.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
report="$HOME/Desktop/commercelab-EC-013-10-2-integration-regression.txt"

fail() { printf 'ERROR: %s\n' "$*" >&2; return 1; }

get_test_url() {
  local purpose="$1"
  # Node 24 loads .env without relying on pnpm/Vitest loading it implicitly.
  # The output is captured into a shell variable and NEVER written to the report.
  node --env-file=.env - "$purpose" <<'NODE'
const purpose = process.argv[2];
const spec = {
  authz: { env: 'EC013_AUTHZ_TEST_DATABASE_URL', name: 'commercelab_authz_test' },
  checkout: { env: 'EC013_CHECKOUT_TEST_DATABASE_URL', name: 'commercelab_checkout_test' },
}[purpose];
if (!spec) process.exit(1);
const explicit = process.env[spec.env];
const development = process.env.DATABASE_URL;
const raw = explicit || development;
if (!raw) {
  console.error(`Neither ${spec.env} nor DATABASE_URL was found. Aborting.`);
  process.exit(1);
}
let url;
try { url = new URL(raw); } catch {
  console.error('Invalid database URL. Aborting.'); process.exit(1);
}
const expectedSource = explicit ? `/${spec.name}` : '/commercelab_dev';
const allowed = ['postgresql:', 'postgres:'].includes(url.protocol)
  && ['127.0.0.1', 'localhost'].includes(url.hostname)
  && url.port === '5433'
  && url.username === 'commercelab'
  && url.pathname === expectedSource
  && !url.hash
  && [...url.searchParams.keys()].every(k => k === 'schema')
  && (!url.searchParams.has('schema') || url.searchParams.get('schema') === 'public');
if (!allowed) {
  console.error(`Unexpected ${explicit ? spec.env : 'development DATABASE_URL'} target. Aborting without testing.`);
  console.error(`Expected local port 5433, user commercelab, database ${expectedSource.slice(1)}.`);
  process.exit(1);
}
if (!explicit) url.pathname = `/${spec.name}`;
process.stdout.write(url.toString());
NODE
}

verify_target() {
  local database="$1" url="$2"
  local actual
  actual="$(docker exec commerce-lab-dev-postgres-1 \
    psql -U commercelab -d "$database" -X -v ON_ERROR_STOP=1 -At \
    -c 'SELECT current_database()' | tr -d '\r\n')" || return 1
  [[ "$actual" == "$database" ]] || fail "PostgreSQL did not confirm the expected test database $database"

  # No migrate deploy here: this gate only reads migration status.
  local status_output
  if ! status_output="$(DATABASE_URL="$url" pnpm exec prisma migrate status 2>&1)"; then
    printf '%s\n' "$status_output"
    fail "Migration status could not be read for $database"
    return 1
  fi
  printf '%s\n' "$status_output"
  [[ "$status_output" == *'Database schema is up to date!'* ]] || {
    fail "Migration status is not up to date for $database"; return 1;
  }
  printf 'PREFLIGHT PASS: %s — PostgreSQL identity and migration status confirmed.\n' "$database"
}

run_integration() {
  local label="$1" file="$2" expected="$3" url="$4" environment_name="$5"
  local output exit_code
  output="$(mktemp)" || return 1
  printf '\n=== %s: %s (expect %s passed) ===\n' "$label" "$file" "$expected"
  if env -u EC013_AUTHZ_TEST_DATABASE_URL -u EC013_CHECKOUT_TEST_DATABASE_URL \
    DATABASE_URL="$url" "$environment_name=$url" CI=1 NO_COLOR=1 \
    pnpm exec vitest run "$file" > "$output" 2>&1; then
    exit_code=0
  else
    exit_code=$?
  fi
  cat "$output"
  if (( exit_code != 0 )); then
    rm -f "$output"
    fail "$label exited with code $exit_code"
    return 1
  fi
  # Exit 0 is insufficient: Vitest may exit successfully when every test is skipped.
  if ! node - "$output" "$expected" <<'NODE'; then
const fs = require('node:fs');
const log = fs.readFileSync(process.argv[2], 'utf8')
  .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
const expected = Number(process.argv[3]);
const line = log.split(/\r?\n/).find(s => /^\s*Tests\s+/.test(s));
const filesLine = log.split(/\r?\n/).find(s => /^\s*Test Files\s+/.test(s));
if (!line || !new RegExp(`\\b${expected} passed\\b`).test(line) ||
    /\b(?:skipped|failed|todo|pending)\b/.test(line) ||
    !filesLine || !/\b1 passed\b/.test(filesLine) ||
    /\b(?:skipped|failed)\b/.test(filesLine)) {
  console.error(`Expected ${expected} passed (no skipped/failed). Got: ${line || 'no test summary'}`);
  process.exit(1);
}
NODE
    rm -f "$output"
    fail "$label did not report exactly $expected passed with zero skipped"
    return 1
  fi
  rm -f "$output"
  printf 'RESULT: PASS — %s: %s passed, 0 skipped.\n' "$label" "$expected"
}

main() {
  cd "$repo_root"
  [[ -f apps/api/package.json && -f apps/api/.env ]] || { fail 'Not a CommerceLab checkout or missing apps/api/.env'; return 1; }
  [[ "$(git rev-parse --show-toplevel)" == "$repo_root" ]] || { fail 'Script must be under repo-root/scripts'; return 1; }
  [[ "$(git branch --show-current)" == 'feature/security-performance' ]] || { fail 'Wrong Git branch'; return 1; }
  command -v docker >/dev/null || { fail 'Docker is required'; return 1; }
  command -v pnpm >/dev/null || { fail 'pnpm is required'; return 1; }
  command -v node >/dev/null || { fail 'Node.js is required'; return 1; }

  printf '=== EC-013.10.2 — isolated DB regression ===\n'
  printf 'Git branch: %s\n' "$(git branch --show-current)"
  printf 'Started: %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')"
  printf 'Targets: commercelab_authz_test, commercelab_checkout_test (no development DB writes)\n'

  cd apps/api
  local authz_url checkout_url
  authz_url="$(get_test_url authz)" || return 1
  checkout_url="$(get_test_url checkout)" || return 1

  printf '\n=== PREFLIGHT: isolated test databases ===\n'
  verify_target 'commercelab_authz_test' "$authz_url" || return 1
  verify_target 'commercelab_checkout_test' "$checkout_url" || return 1

  run_integration 'Authorization/ownership' 'tests/authorization-ownership.integration.test.ts' 10 "$authz_url" EC013_AUTHZ_TEST_DATABASE_URL || return 1
  run_integration 'Checkout atomicity' 'tests/checkout-transaction.integration.test.ts' 7 "$checkout_url" EC013_CHECKOUT_TEST_DATABASE_URL || return 1
  run_integration 'Payment and cancellation' 'tests/order-payment-cancellation.integration.test.ts' 11 "$checkout_url" EC013_CHECKOUT_TEST_DATABASE_URL || return 1

  printf '\n=== EC-013.10.2 SUMMARY ===\n'
  printf 'PASS | Authorization & ownership | 10 passed\n'
  printf 'PASS | Checkout atomicity | 7 passed\n'
  printf 'PASS | Payment & cancellation | 11 passed\n'
  printf 'EC-013.10.2 PASS — 28 passed, 0 skipped, 0 failed.\n'
  printf 'Completed: %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')"
}

mkdir -p "$HOME/Desktop"
main 2>&1 | tee "$report"
exit "${PIPESTATUS[0]}"
