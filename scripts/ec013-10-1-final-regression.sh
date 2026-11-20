#!/usr/bin/env bash
# CommerceLab EC-013.10.1 — non-destructive regression gate.
# No migrations, database writes, dependencies installed, or git commits.
set -uo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
cd "$repo_root" || exit 1

if ! command -v git >/dev/null 2>&1 || ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: git and pnpm must be available on PATH." >&2
  exit 1
fi

actual_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ "$actual_root" != "$repo_root" ]]; then
  echo "ERROR: run from a Git checkout with the script under its scripts/ directory." >&2
  exit 1
fi

branch="$(git branch --show-current)"
if [[ "$branch" != "feature/security-performance" ]]; then
  echo "ERROR: expected feature/security-performance, found '$branch'." >&2
  exit 1
fi

if [[ ! -f apps/api/package.json || ! -f apps/web/package.json || ! -f eslint.config.mjs ]]; then
  echo "ERROR: expected CommerceLab workspace files not found." >&2
  exit 1
fi

report="$HOME/Desktop/commercelab-EC-013-10-1-final-regression.txt"
mkdir -p "$HOME/Desktop" || exit 1

echo "Writing full command output to: $report"

# Produce a shareable report, not a raw .env dump. Never enable shell tracing.
{
  echo "=== CommerceLab EC-013.10.1 non-destructive regression ==="
  echo "Branch: $branch"
  echo "Started: $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo "Node: $(node --version 2>/dev/null || echo unavailable)"
  echo "pnpm: $(pnpm --version)"
  echo ""
  echo "=== git status (uncommitted changes are expected) ==="
  git status -sb
  echo ""

  failures=0
  results=()
  run_check() {
    local label="$1"
    shift
    echo ""
    echo "============================================================"
    echo "RUN: $label"
    echo "============================================================"
    if "$@"; then
      echo "RESULT: PASS — $label"
      results+=("PASS | $label")
    else
      local code=$?
      echo "RESULT: FAIL ($code) — $label"
      results+=("FAIL | $label | exit=$code")
      failures=$((failures + 1))
    fi
  }

  run_check "Unstaged whitespace check" git diff --check
  run_check "Staged whitespace check" git diff --cached --check
  run_check "Workspace ESLint (root pnpm lint)" pnpm lint
  run_check "API typecheck" pnpm --filter @commercelab/api typecheck
  run_check "Web typecheck" pnpm --filter @commercelab/web typecheck
  # Exclude all opt-in .integration.test.ts files, independently of dotenv side effects.
  # Also unset explicit opt-in URLs from the process environment (defense in depth).
  run_check "API unit/regression tests (isolated DB suites excluded)" \
    env -u EC013_AUTHZ_TEST_DATABASE_URL -u EC013_CHECKOUT_TEST_DATABASE_URL \
    pnpm --filter @commercelab/api exec vitest run --exclude "**/*.integration.test.ts"
  run_check "Web tests" pnpm --filter @commercelab/web test
  run_check "API production build" pnpm --filter @commercelab/api build
  run_check "Web production build" pnpm --filter @commercelab/web build

  echo ""
  echo "=== EC-013.10.1 SUMMARY ==="
  for result in "${results[@]}"; do
    echo "$result"
  done
  echo "Failed checks: $failures"
  if (( failures == 0 )); then
    echo "EC-013.10.1 PASS (does NOT cover isolated DB tests or historical migration checksum)."
  else
    echo "EC-013.10.1 INCOMPLETE: review failing checks above."
  fi
  echo "Completed: $(date '+%Y-%m-%d %H:%M:%S %z')"
  exit "$(( failures > 0 ? 1 : 0 ))"
} 2>&1 | tee "$report"
exit "${PIPESTATUS[0]}"
