#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f package.json || ! -d apps/web/tests ]]; then
  echo 'ERROR: Run from the CommerceLab monorepo root.' >&2
  exit 1
fi

OUT="${HOME}/Desktop"
mkdir -p "$OUT"

run_check() {
  local name="$1" filename="$2"
  shift 2
  printf '\n=== %s ===\n' "$name"
  if "$@" > "$OUT/$filename" 2>&1; then
    printf 'PASS | %s | %s\n' "$name" "$OUT/$filename"
    tail -n 7 "$OUT/$filename"
  else
    local code=$?
    printf 'FAIL | %s | exit=%s | %s\n' "$name" "$code" "$OUT/$filename" >&2
    tail -n 65 "$OUT/$filename" >&2
    exit "$code"
  fi
}

run_check 'EC-014.4 targeted frontend tests' 'commercelab-EC-014-4-targeted.txt' \
  pnpm --filter @commercelab/web exec vitest run \
    tests/features/auth/components/protected-route.test.tsx \
    tests/components/pages/auth-pages.test.tsx \
    tests/components/pages/cart-page.test.tsx \
    tests/components/pages/checkout-page.test.tsx

run_check 'Complete Web regression' 'commercelab-EC-014-4-web-regression.txt' \
  pnpm --filter @commercelab/web test

run_check 'Web TypeScript' 'commercelab-EC-014-4-web-typecheck.txt' \
  pnpm --filter @commercelab/web typecheck

run_check 'Workspace ESLint' 'commercelab-EC-014-4-lint.txt' \
  pnpm lint

printf '\nEC-014.4 FRONTEND CHECKS PASSED (4/4). No Git changes made by this script.\n'
