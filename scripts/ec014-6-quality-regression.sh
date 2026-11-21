#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$PWD"
mode="${1:---check}"
[[ "$mode" == '--bootstrap' || "$mode" == '--check' ]] || { echo 'Usage: bash scripts/ec014-6-quality-regression.sh --bootstrap|--check' >&2; exit 2; }
[[ -f pnpm-workspace.yaml && -f apps/web/playwright.config.ts ]] || { echo 'ERROR: Not a configured CommerceLab checkout' >&2; exit 1; }

if [[ -n "${CI:-}" ]]; then
  OUT="$ROOT/.reports/ec014"
else
  OUT="${EC014_REPORT_DIR:-$HOME/Desktop}"
fi
mkdir -p "$OUT"

run_check() {
  local name="$1" file="$2"; shift 2
  echo "=== $name ==="
  if "$@" > "$OUT/$file" 2>&1; then
    echo "PASS | $name | $OUT/$file"
    tail -n 9 "$OUT/$file"
  else
    local code=$?
    echo "FAIL | $name | code=$code | $OUT/$file" >&2
    tail -n 70 "$OUT/$file" >&2
    exit "$code"
  fi
}

run_check 'Workspace ESLint' 'ec014-6-eslint.txt' pnpm lint
run_check 'Production TypeScript' 'ec014-6-typecheck.txt' pnpm typecheck
run_check 'API tests TypeScript' 'ec014-6-api-test-typecheck.txt' pnpm --filter @commercelab/api typecheck:tests
run_check 'Playwright TypeScript' 'ec014-6-e2e-typecheck.txt' pnpm --filter @commercelab/web exec tsc --noEmit -p tsconfig.e2e.json
run_check 'Production build' 'ec014-6-build.txt' pnpm build

run_check 'API coverage, isolated DB suites excluded' 'ec014-6-api-coverage.txt' \
  pnpm --filter @commercelab/api exec vitest run \
  --exclude '**/*.integration.test.ts' \
  --coverage.enabled --coverage.provider=v8 \
  --coverage.include 'src/**/*.{ts,tsx}' \
  --coverage.exclude 'src/generated/**' \
  --coverage.exclude 'src/**/*.d.ts' \
  --coverage.reporter=text --coverage.reporter=json-summary \
  --coverage.reportsDirectory=coverage/ec014 \
  --reporter=default --reporter=json \
  --outputFile.json=coverage/ec014/vitest-results.json

run_check 'Web coverage' 'ec014-6-web-coverage.txt' \
  pnpm --filter @commercelab/web exec vitest run \
  --coverage.enabled --coverage.provider=v8 \
  --coverage.include 'src/**/*.{ts,tsx}' \
  --coverage.reporter=text --coverage.reporter=json-summary \
  --coverage.reportsDirectory=coverage/ec014 \
  --reporter=default --reporter=json \
  --outputFile.json=coverage/ec014/vitest-results.json

run_check 'Coverage & test-count gate' 'ec014-6-quality-gate.txt' \
  node scripts/ec014-6-coverage-gate.mjs "$mode"

run_check 'Chromium mock API E2E' 'ec014-6-browser-e2e.txt' \
  env EC014_E2E_LIVE=0 pnpm --filter @commercelab/web exec playwright test -c playwright.config.ts

printf '\nPASS | EC-014.6 quality regression | mode=%s\n' "$mode"
echo "Coverage: apps/api/coverage/ec014 and apps/web/coverage/ec014"
echo "Logs: $OUT"
echo 'Note: isolated PostgreSQL suites and live E2E are intentionally outside this fast CI gate.'
