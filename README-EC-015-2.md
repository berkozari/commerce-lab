# CommerceLab — EC-015.2 Docker Development Environment

## Purpose

Opt-in **full-stack Docker development** (API + Web + existing PostgreSQL) without changing the existing `docker/compose.dev.yml`, `commerce_pg_data` volume, local `pnpm dev` workflow, or EC-014 isolated PostgreSQL/Playwright tests. The default PostgreSQL-only developer workflow remains supported.

This package was prepared against the user's **EC-015.1 CommerceLab infrastructure ZIP**. The package was syntax-checked; actual Docker builds and live service health must be verified on the user's Mac.

## Files

- `.dockerignore`: excludes Git metadata, dependencies, build artifacts and all local `.env*` secrets from Docker build context.
- `docker/dev.Dockerfile`: one shared pnpm workspace base with separate `api-dev` and `web-dev` targets, Node 22, pnpm 10, Prisma client generation.
- `docker/compose.full-dev.yml`: **additional Compose file** defining only API/Web and a generated-client volume. PostgreSQL is **inherited, unchanged**, from `docker/compose.dev.yml`.
- `scripts/ec015-2-apply-vite-config.mjs`: strictly changes Vite host/proxy **only when `COMMERCE_DOCKER_DEV=1`**. Native Vite and Playwright stay on their existing settings. Refuses unexpected Vite config changes. Backs up original to `.reports/ec015-2/vite.config.ts.before`.
- `scripts/ec015-2-prepare-env.mjs`: derives the internal `postgres:5432` connection URL from the **actual resolved PostgreSQL password** in the existing Docker Compose configuration, and creates `docker/.env.full` with fresh, local-only auth secrets (permissions `0600`). Never changes `docker/.env` or existing DB. Never overwrites existing `.env.full`.
- `scripts/ec015-2-dev-stack.sh`: start, status, logs, stop and smoke-test commands.
- `scripts/ec015-2-smoke.sh`: checks API readiness, frontend HTML and frontend-to-API proxy.

## Prerequisites

- CommerceLab monorepo on your development branch, with existing EC-014 changes applied.
- Docker Desktop running, Docker Compose V2 with `--env-file` support, Node.js 22 and `curl` on the host.
- Existing `docker/.env` with the **correct** `COMMERCE_DB_PASSWORD` for your persisted PostgreSQL volume. **Do not generate a replacement database password** against an existing volume.
- Port `3000` (API) and `5173` (Web) available on the host. Stop a previously running native `pnpm dev` first. PostgreSQL continues on `127.0.0.1:5433`.

## Apply (from CommerceLab repository root)

```bash
unzip -l "$HOME/Downloads/commerce-lab-EC-015-2-docker-dev.zip"
unzip -o "$HOME/Downloads/commerce-lab-EC-015-2-docker-dev.zip" -d .

# One command to patch Docker-only Vite settings, generate local Docker app env,
# build images, start containers, and smoke test HTTP + reverse proxy:
bash scripts/ec015-2-dev-stack.sh up
```

**Only one existing tracked source file is changed** by the apply script: `apps/web/vite.config.ts` (a conditional `COMMERCE_DOCKER_DEV` host/proxy). All other delivered files are additive. No database migration/seed/reset, no Git staging/commit, no changes to existing PostgreSQL service config.

## How to use

```bash
# HTTP and container health checks, after up
bash scripts/ec015-2-dev-stack.sh smoke

# Service status
bash scripts/ec015-2-dev-stack.sh ps

# Recent API/Web logs, without dumping Compose secret interpolation
bash scripts/ec015-2-dev-stack.sh logs

# Stop ONLY API + Web; leave PostgreSQL running for local apps/test scripts
bash scripts/ec015-2-dev-stack.sh down
```

Open: `http://127.0.0.1:5173` (Web); `http://127.0.0.1:3000/api/v1/health/ready` (API); `http://127.0.0.1:5173/api/v1/health/ready` (Vite proxy); and `http://127.0.0.1:3000/api-docs` (nonproduction Swagger).

### Development changes

- API source and Prisma schema changes bind-mount into the API container; Express `tsx watch` reloads source changes.
- Web source and Vite config bind-mount into the Web container; Vite HMR updates UI.
- Dependencies are baked into the image: **rebuild** (`... dev-stack.sh up`) after changing package.json or lockfile. The generated Prisma client lives in a container volume, not the host source tree.
- Compose uses existing persisted PostgreSQL data. **It does not run Prisma migrations or seed data**: those are intentionally addressed in EC-015.4. On a new/uninitialized database, some API endpoints may fail until migrations/seed are explicitly applied to the intended database.

## Safety notes

- Never run `docker compose down -v`, `docker volume rm`, or `prisma migrate reset` against the existing development database.
- `docker/.env.full` includes derived DB access and auth secrets. It is gitignored via the project's current `.gitignore` (`.env.*`) and Docker-ignored. Do not upload it, stage it, or paste its contents into an issue/log.
- `ec015-2-dev-stack.sh down` stops API and Web only; it does NOT stop or delete PostgreSQL.
- API and Web expose only host loopback ports, not the public network. This is **development-only** Docker, not a production deployment.
- EC-014 E2E (port 5187 and API 3187 in live mode) and isolated DB scripts are unchanged. Avoid running incompatible test and full-stack dev processes on overlapping ports; they remain independently runnable.
- If the strict Vite patch rejects your current `vite.config.ts`, **do not force it**. Share the current Vite config without secrets for reconciliation.

## Validation and handoff

The expected success marker is:

```
EC-015.2 FULL-STACK DOCKER DEV SMOKE PASS
```

Share the terminal output (redact passwords/tokens), or run:

```bash
bash scripts/ec015-2-dev-stack.sh ps
bash scripts/ec015-2-dev-stack.sh smoke
```

If the build fails, share the last ~50 lines of the error output, not the contents of `docker/.env` or `docker/.env.full`.

EC-015.2 can be marked complete after the local containers, healthchecks and Vite-to-API proxy all pass. Next: EC-015.3 environment & secret management, followed by EC-015.4 migration/seed automation.
