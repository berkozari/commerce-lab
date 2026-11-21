#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f package.json || ! -d apps/api/prisma/migrations ]]; then
  echo 'ERROR: Run this from the CommerceLab monorepo root.' >&2
  exit 1
fi

: "${EC014_E2E_DATABASE_URL:?Set EC014_E2E_DATABASE_URL to a separate LOCAL postgres DB named commercelab_e2e_*}"
python3 - <<'PY'
import os
from urllib.parse import urlsplit, unquote
import re
url = urlsplit(os.environ['EC014_E2E_DATABASE_URL'])
db = unquote(url.path.lstrip('/'))
assert url.scheme in ('postgresql', 'postgres'), 'Only PostgreSQL is supported'
assert url.hostname in ('127.0.0.1', 'localhost', '::1'), 'DB host must be local'
assert re.fullmatch(r'commercelab_e2e_[a-z0-9_]+', db), 'DB name must start with commercelab_e2e_'
print('Verified dedicated local E2E database:', db)
PY

export DATABASE_URL="$EC014_E2E_DATABASE_URL"
# This intentionally changes ONLY the verified dedicated E2E database.
pnpm --filter @commercelab/api exec prisma generate
pnpm --filter @commercelab/api exec prisma migrate deploy
pnpm --filter @commercelab/api exec prisma db seed
printf '\nDedicated E2E DB migrated and seeded (no reset). Ready for live test.\n'
