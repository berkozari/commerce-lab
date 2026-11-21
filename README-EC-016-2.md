# EC-016.2 — Architecture, Database and API Documentation

## Purpose

Document the implementation already present in CommerceLab without changing API behavior, application logic, Prisma schema, migration files or the existing PostgreSQL volume.

**Source limitation:** built from `commercelab-EC-015-1-infrastructure-audit.zip`, the EC-015 implementation packages and the EC-016.1 repository baseline from this conversation. The latest merged `main` was not directly accessible. The apply script refuses to replace a database document that differs from the reviewed baseline; inspect any failure against your current branch rather than bypassing the guard.

## Contents

- `scripts/ec016-2-docs.mjs`: guarded install and static contract verification.
- `docs/_ec0162_drafts/architecture.md`: architecture, layer boundaries and auth/cart/checkout sequence diagrams.
- `docs/_ec0162_drafts/database.md`: 12-model ER diagram, transaction invariants, seven migration records and local/CI database safety.
- `docs/_ec0162_drafts/api.md`: endpoint groups, cookie/CSRF flow, checkout idempotency, OpenAPI limitations.
- `apps/api/docs/openapi/openapi.yaml` **is not included as a replacement**; the script applies a targeted update to its existing catalog query parameters and checkout stock wording.

## Installation

Start from `feature/portfolio-documentation`, up to date with merged `main`. From the repository root:

```bash
unzip -o "$HOME/Downloads/commerce-lab-EC-016-2-architecture-api.zip" -d .
node scripts/ec016-2-docs.mjs apply
node scripts/ec016-2-docs.mjs verify
```

`apply` refuses to overwrite a nonempty `docs/architecture.md`, an existing `docs/api.md`, or a changed `docs/database.md`. It moves the draft files into `docs/` only after checks pass. Repeating `apply` on an installed package simply verifies the result.

## Review and validation

```bash
node --check scripts/ec016-2-docs.mjs
node scripts/ec016-2-docs.mjs verify
pnpm lint
pnpm --filter @commercelab/api typecheck:tests
git diff --check
git status --short
```

Review these files specifically:

- `docs/architecture.md`
- `docs/database.md`
- `docs/api.md`
- `apps/api/docs/openapi/openapi.yaml`
- `scripts/ec016-2-docs.mjs`

Before committing, read the Mermaid diagrams on GitHub's Markdown preview and check the live API's behavior is described accurately. The contract verifier scans statically declared Express HTTP routes against OpenAPI method/path entries and checks model/migration coverage, **not complete Zod / response-schema compatibility**.

You may commit the intended files after review:

```bash
git add docs/architecture.md docs/database.md docs/api.md \
  apps/api/docs/openapi/openapi.yaml scripts/ec016-2-docs.mjs
git diff --cached --check
git diff --cached --stat
git commit -m "docs: add architecture database and API contract guides"
```

You can keep the branch unmerged until EC-016.3 portfolio screenshots and final review. No database migration, seed, Docker restart or volume manipulation is necessary for this package.

## Expected success

```text
PASS | 12 Prisma models, 7 migrations documented
PASS | OpenAPI covers 38 HTTP method/path operations
PASS | Catalog filters/sorts and checkout stock semantics reviewed
EC-016.2 DOCUMENTATION VERIFY PASS
```

If the current source has gained models, migrations or routes, the static verifier will report the mismatch. Update the documentation deliberately; don't weaken the check just to get a green result.
