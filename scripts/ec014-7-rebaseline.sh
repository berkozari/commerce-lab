#!/usr/bin/env bash
# Deliberately replace a *first-measurement* baseline after correcting its source scope.
# Keep an external backup; automatically restore the previous baseline on failure.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[[ -f pnpm-workspace.yaml && -f scripts/ec014-6-quality-regression.sh && -f scripts/ec014-6-coverage-gate.mjs ]] || {
  echo 'ERROR: Run from a configured CommerceLab checkout.' >&2; exit 1;
}
[[ -f quality/ec014-coverage-baseline.json ]] || {
  echo 'ERROR: Existing EC-014 baseline missing; run the normal --bootstrap workflow instead.' >&2; exit 1;
}
# Use '--' so grep does not treat a pattern beginning with dashes as an option.
grep -Fq -- "--coverage.exclude 'src/generated/**'" scripts/ec014-6-quality-regression.sh || {
  echo 'ERROR: Apply EC-014.7 scope patch before correcting baseline.' >&2; exit 1;
}
grep -Fq 'EC0147_SOURCE_SCOPE_GUARD' scripts/ec014-6-coverage-gate.mjs || {
  echo 'ERROR: Updated quality gate not detected.' >&2; exit 1;
}
node - <<'NODE'
const fs = require('node:fs');
const b = JSON.parse(fs.readFileSync('quality/ec014-coverage-baseline.json', 'utf8'));
if (b.schemaVersion !== 1 || !b.suites?.api || !b.suites?.web) {
  throw new Error('Unexpected baseline schema; refusing automatic correction');
}
NODE
OUT="${EC014_REPORT_DIR:-$HOME/Desktop}"
mkdir -p "$OUT"
stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
backup="$OUT/ec014-7-original-coverage-baseline-${stamp}.json"
[[ ! -e "$backup" ]] || { echo "ERROR: Backup already exists: $backup" >&2; exit 1; }
cp quality/ec014-coverage-baseline.json "$backup"
restore=1
restore_if_needed() {
  local code=$?
  if [[ "$restore" == 1 ]]; then
    cp "$backup" quality/ec014-coverage-baseline.json
    echo "RESTORED | Previous baseline, because scope remeasurement did not complete successfully. Backup: $backup" >&2
  fi
  return "$code"
}
trap restore_if_needed EXIT
rm quality/ec014-coverage-baseline.json
bash scripts/ec014-6-quality-regression.sh --bootstrap
node scripts/ec014-6-coverage-gate.mjs --check > "$OUT/ec014-7-corrected-baseline-check.txt" 2>&1
restore=0
trap - EXIT
echo "PASS | Corrected source-scope baseline created and validated."
echo "Previous baseline backup: $backup"
echo "Check log: $OUT/ec014-7-corrected-baseline-check.txt"
echo 'No Git commit made; no PostgreSQL data touched.'
