# CommerceLab — EC-015.4 Migration & Seed Automation

## Goal

Provide explicit, auditable Prisma migration/seed commands for the **existing local Docker development database only**. This follows EC-015.2 full-stack Docker (3 smoke checks passed) and EC-015.3 environment/secret audit (PASS).

## Delivered

- `scripts/ec015-4-db.mjs` — guarded, repository-root-independent workflow; no dependencies added.

## Safety contract

- Fixed Compose project `commerce-lab-dev`, service `postgres`, database `commercelab_dev`, database role `commercelab`, container port `5432`, host loopback port `5433`. Requires a healthy PostgreSQL container, named database volume, and the existing matching `docker/.env` + `docker/.env.full` credentials.
- Reads **PostgreSQL identity** and Prisma migration history before touching data. Refuses missing baseline history on a pre-existing schema, unknown migrations, unresolved failures, or unexpected Docker endpoints.
- No `prisma migrate reset`, `prisma db push`, `CREATE/DROP DATABASE`, `docker compose down -v`, destructive volume operation, automatic migration baselining, or writes to E2E/test databases.
- `status` and `verify` are read-only for the database. They can start a short-lived container for `prisma migrate status`, but never apply migrations or seed data.
- `prepare --confirm-dev` is the **only** write operation; it requires a `feature/*` branch and explicit confirmation flag. It applies only pending versioned migrations via `prisma migrate deploy`, never creates new migration files, and runs `prisma db seed` only when one or more demo items are missing. If everything is current, it is a no-op.
- Existing seed uses Prisma upserts and `inventory.update: {}` to avoid resetting inventory quantities. If seeding is needed, it **may update demo product/category metadata** (names, prices and statuses). Versioned migrations can alter/drop schema structures: **review pending migration.sql files and have a backup before approving changes.**
- Suppresses raw Compose/Prisma output, which might contain credentials; prints only database identities, migration names/counts and pass/fail summaries. Does not overwrite local `.env` files or generate a Git commit.
- `migrate status` verifies recorded migration history against local migration files. **It is not a complete schema-drift detector and does not prove that migrations are non-destructive.**

## Prerequisites

From CommerceLab repository root (on `feature/devops-ci-cd` or another `feature/*` branch): Docker Desktop, Node 22+, PostgreSQL and the EC-015.2 API image installed. EC-015.3 `--local` must have passed. The running Docker API/Web stack is fine; only the PostgreSQL container is essential for the guard. The local `.env` files must never be shared.

## 1. Install (extract at repository root)

```bash
unzip -l "$HOME/Downloads/commerce-lab-EC-015-4-migrations-seed.zip"
unzip -o "$HOME/Downloads/commerce-lab-EC-015-4-migrations-seed.zip" -d .
node --check scripts/ec015-4-db.mjs
```

## 2. Read-only audit

```bash
node scripts/ec015-4-db.mjs status
```

Expected if the DB is already prepared: local Compose guard PASS; PostgreSQL identity PASS; migrations applied and none pending; Prisma migration status PASS; demo catalog `3/3` items present. No database writes.

When the script lists pending migrations, inspect each corresponding `apps/api/prisma/migrations/<name>/migration.sql` and take a database backup if schema changes are needed before invoking `prepare`.

## 3. Apply pending migrations and optional seed (explicit approval)

**Only after checking `status` and reviewing any pending migration SQL:**

```bash
node scripts/ec015-4-db.mjs prepare --confirm-dev
```

This runs Prisma commands from a one-off API development image on the **fixed** `commercelab_dev` database. Existing local API/Web containers can remain running. There is no automatic dev DB reset. This step may update the development schema and demo catalog data if they are not already current.

## 4. Final read-only verification

```bash
node scripts/ec015-4-db.mjs verify
bash scripts/ec015-2-dev-stack.sh smoke
```

Expected terminal markers:

```
PASS | EC-015.4 DATABASE VERIFY PASS
PASS | API readiness
PASS | Vite frontend
PASS | Web-to-API reverse proxy
```

If status already reports `0 pending` and `3/3` seeded, you can **skip `prepare`** and run only `verify` plus smoke checks.

## Failure handling

- Script refuses a different database, role, Compose project, port or volume: **do not bypass the guards**. Share only the FAIL message, never the raw Compose config / `.env`.
- If migration history is inconsistent, do not delete `_prisma_migrations`, mark a baseline automatically, or edit historical migrations. Preserve the DB and investigate separately.
- If the API image is stale after dependency changes, rebuild using the existing EC-015.2 dev stack instructions; this script does not rebuild/restart services.
- Do not run test DB migration scripts against `commercelab_dev`. CI/test DB provisioning is a separate workstream in EC-015.6.

## Completion criteria

A successful local `verify` and repeat of the three Docker smoke checks closes EC-015.4. EC-015.5 then integrates lint, typecheck, build, Vitest and browser tests into GitHub Actions without secrets; EC-015.6 adds isolated PostgreSQL CI tests.
