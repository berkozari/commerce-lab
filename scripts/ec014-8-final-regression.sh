#!/usr/bin/env bash
# CommerceLab EC-014.8 — orchestrate already-reviewed tests; no git writes or DB resets.
set -euo pipefail

fail() { printf 'ERROR | %s\n' "$*" >&2; exit 1; }
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$script_dir/.." && pwd)"
cd "$root"

mode="${1:---fast}"
[[ "$mode" == '--fast' || "$mode" == '--full' ]] || fail 'Usage: bash scripts/ec014-8-final-regression.sh --fast|--full'
[[ -f pnpm-workspace.yaml && -f apps/api/package.json && -f apps/web/playwright.config.ts ]] || fail 'Not a CommerceLab monorepo root.'
[[ -f quality/ec014-coverage-baseline.json ]] || fail 'Missing measured coverage baseline. Do not fabricate or overwrite it.'
for tool in git pnpm node; do command -v "$tool" >/dev/null || fail "Missing tool: $tool"; done
branch="$(git branch --show-current)"
[[ "$branch" == 'feature/testing-quality-assurance' ]] || fail "Expected feature/testing-quality-assurance, got '$branch'."
[[ -f scripts/ec014-6-quality-regression.sh ]] || fail 'Missing EC-014.7 quality gate script.'

out="${EC014_FINAL_REPORT_DIR:-$HOME/Desktop/commercelab-ec014-8}"
mkdir -p "$out"
run_step() {
  local label="$1" filename="$2"; shift 2
  printf '\n== %s ==\n' "$label"
  if "$@" > "$out/$filename" 2>&1; then
    printf 'PASS | %s | %s\n' "$label" "$out/$filename"
    tail -n 9 "$out/$filename"
  else
    local code=$?
    printf 'FAIL | %s | exit=%s | %s\n' "$label" "$code" "$out/$filename" >&2
    tail -n 70 "$out/$filename" >&2
    exit "$code"
  fi
}

printf 'CommerceLab EC-014.8 | mode=%s | branch=%s\n' "$mode" "$branch"
run_step 'Git whitespace checks' 'git-diff-check.txt' git diff --check
run_step 'Fast quality gate: lint, typechecks, build, Vitest, mocked Chromium E2E' \
  'quality-check.txt' bash scripts/ec014-6-quality-regression.sh --check

grep -Fq 'PASS | EC-014.6 quality regression | mode=--check' "$out/quality-check.txt" || fail 'Fast quality script did not emit its expected success marker.'

# Verify actual Vitest JSON outcomes rather than trusting labels/expected counts.
node - <<'NODE' || fail 'API/Web structured Vitest report check failed.'
const fs = require('node:fs');
for (const [app, minimum] of [['api', 181], ['web', 78]]) {
  const path = `apps/${app}/coverage/ec014/vitest-results.json`;
  const report = JSON.parse(fs.readFileSync(path, 'utf8'));
  const passed = report.numPassedTests;
  const failed = report.numFailedTests;
  const pending = report.numPendingTests;
  if (![passed, failed, pending].every(Number.isInteger)
      || passed < minimum || failed !== 0 || pending !== 0) {
    throw new Error(`${app} expected >=${minimum} passed, 0 failed/pending; found ${JSON.stringify({ passed, failed, pending })}`);
  }
  console.log(`VERIFIED | ${app}: ${passed} passed, 0 failed, 0 pending`);
}
NODE

if [[ "$mode" == '--full' ]]; then
  # The existing dedicated DB scripts perform their own hostname, database-name,
  # migration-state and git-branch checks; never bypass those checks.
  [[ -f scripts/ec013-10-2-isolated-db-regression.sh ]] || fail 'Missing isolated PostgreSQL runner.'
  [[ -f scripts/ec014-5-live-e2e-one-command.sh ]] || fail 'Missing isolated live E2E runner.'
  command -v docker >/dev/null || fail 'Docker is required for --full.'
  run_step 'PostgreSQL isolated integration suites' \
    'isolated-postgresql.txt' bash scripts/ec013-10-2-isolated-db-regression.sh
  # Some historical copies of this runner covered 28 tests. Require all 42.
  node - "$out/isolated-postgresql.txt" <<'NODE' || fail 'Isolated DB results did not establish all 42 tests passed.'
const fs = require('node:fs');
const log = fs.readFileSync(process.argv[2], 'utf8').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
const last = log.slice(-2500);
if (!/42 passed\b/.test(last) || !/\b0 skipped\b/.test(last) || !/\b0 failed\b/.test(last)) {
  console.error('Expected final 42 passed / 0 skipped / 0 failed summary. Last lines:\n' + last.slice(-1000));
  process.exit(1);
}
console.log('VERIFIED | 42 isolated PostgreSQL tests, no skipped/failed.');
NODE
  run_step 'Dedicated-database full-stack Playwright E2E' \
    'live-full-stack-e2e.txt' bash scripts/ec014-5-live-e2e-one-command.sh
  grep -Fq 'EC-014.5 FULL-STACK E2E PASS' "$out/live-full-stack-e2e.txt" || fail 'Live E2E success marker missing.'
  # The existing runner writes this file and expects exactly one full-stack test.
  node - "$HOME/Desktop/commercelab-EC-014-5-playwright.txt" <<'NODE' || fail 'Live Playwright result did not show exactly one passing test.'
const fs = require('node:fs');
const path = process.argv[2];
const log = fs.readFileSync(path, 'utf8').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
if (!/^\s*1 passed \(/m.test(log) || /^\s*\d+ (?:failed|skipped)\b/m.test(log)) {
  throw new Error(`Expected only one passing live E2E in ${path}`);
}
console.log('VERIFIED | 1 live Playwright test passed.');
NODE
fi

# No git add/commit. Record workspace changes for human review only.
run_step 'Git working-tree inventory' 'git-status.txt' git status --short
{
  printf 'CommerceLab EC-014.8 result — %s\n' "$mode"
  printf 'PASS | quality gate + API/Web results + mocked Chromium E2E\n'
  if [[ "$mode" == '--full' ]]; then
    printf 'PASS | 42 isolated PostgreSQL tests + 1 live API/PostgreSQL E2E\n'
  else
    printf 'NOT RUN | isolated PostgreSQL tests + live E2E (use --full)\n'
  fi
  printf 'No Git commit performed. No dev DB reset performed by this script.\n'
  printf 'Review git-status.txt before EC-014 milestone sign-off.\n'
} | tee "$out/summary.txt"
printf '\nLogs: %s\n' "$out"
