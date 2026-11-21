#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f package.json || ! -f apps/web/playwright.config.ts || ! -d apps/web/e2e ]]; then
  echo 'ERROR: Run this from the CommerceLab monorepo root after extracting the package.' >&2
  exit 1
fi

OUT="$HOME/Desktop"
mkdir -p "$OUT"

run_check() {
  local name="$1" output="$2"; shift 2
  printf '\n=== %s ===\n' "$name"
  if "$@" > "$OUT/$output" 2>&1; then
    echo "PASS | $name | $OUT/$output"
    tail -n 12 "$OUT/$output"
  else
    local code=$?
    echo "FAIL | $name | code=$code | $OUT/$output" >&2
    tail -n 70 "$OUT/$output" >&2
    exit "$code"
  fi
}

run_check 'Playwright TypeScript' 'commercelab-EC-014-5-e2e-typecheck.txt' \
  pnpm --filter @commercelab/web exec tsc --noEmit -p tsconfig.e2e.json
run_check 'Playwright browser flows' 'commercelab-EC-014-5-playwright.txt' \
  pnpm --filter @commercelab/web exec playwright test -c playwright.config.ts
run_check 'Workspace ESLint' 'commercelab-EC-014-5-eslint.txt' pnpm lint

if [[ "${EC014_E2E_LIVE:-0}" == "1" ]]; then
  echo 'EC-014.5 LIVE FULL-STACK E2E PASSED (test DB required).'
else
  echo 'EC-014.5 MOCKED-BACKEND BROWSER E2E PASSED.'
  echo 'Real API/PostgreSQL E2E is separate and opt-in; see README.'
fi
