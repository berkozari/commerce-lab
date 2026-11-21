#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[[ -f pnpm-workspace.yaml && -f apps/api/package.json && -f apps/web/package.json ]] || { echo 'ERROR: Run in CommerceLab monorepo.' >&2; exit 1; }

# v8 provider must match the actual installed Vitest for each workspace.
for package in '@commercelab/api' '@commercelab/web'; do
  version="$(pnpm --filter "$package" exec vitest --version | sed -nE 's/^vitest\/([0-9]+\.[0-9]+\.[0-9]+).*/\1/p' | head -n 1)"
  [[ -n "$version" ]] || { echo "ERROR: Could not determine Vitest version for $package" >&2; exit 1; }
  echo "Installing @vitest/coverage-v8@$version for $package"
  pnpm --filter "$package" add -D "@vitest/coverage-v8@$version"
done

# Never commit generated coverage or HTML reports. The baseline JSON is separate.
for entry in 'apps/api/coverage/' 'apps/web/coverage/' '.reports/'; do
  if [[ ! -f .gitignore ]] || ! grep -Fxq "$entry" .gitignore; then
    printf '\n%s\n' "$entry" >> .gitignore
  fi
done
printf '\nPASS | Coverage dependencies installed; generated reports ignored.\n'
