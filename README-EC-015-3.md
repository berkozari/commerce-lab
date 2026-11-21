# CommerceLab — EC-015.3 Environment & Secret Management

## Goal

Document the *existing* native API / Docker development settings and add a read-only safety audit. Preserve the working EC-015.2 containers and the existing PostgreSQL volume. This is not a production secret store or an automated rotation system.

## What changes

New files only:

- `docker/.env.example` — a **placeholder**, not a credential. Never overwrite your existing `docker/.env` with it.
- `apps/api/.env.example` — native Node API environment keys; distinct JWT and CSRF secrets are required.
- `scripts/ec015-3-env-audit.mjs` — local/template-only checks; never prints environment values, executes migrations, writes secret files, or performs Docker restart.

No production source modifications, no automatic secret rotation, no changes to Compose or existing generated `docker/.env.full`. The generated `.env.full` is written by EC-015.2 and should remain local and gitignored. Web has no required `VITE_` credentials; do not expose auth/database secrets to Vite.

## Apply (CommerceLab root)

```bash
unzip -l "$HOME/Downloads/commerce-lab-EC-015-3-env-secrets.zip"
unzip -o "$HOME/Downloads/commerce-lab-EC-015-3-env-secrets.zip" -d .
node scripts/ec015-3-env-audit.mjs --templates
node scripts/ec015-3-env-audit.mjs --local
bash scripts/ec015-2-dev-stack.sh smoke
```

`--templates` is CI-safe: checks examples, Git ignore patterns, the Git index, and `.dockerignore`. No actual secrets required. `--local` additionally checks `docker/.env` + generated `docker/.env.full` permissions (`0600`), secret distinctness, expected Docker-only database identity, and consistency with the **resolved** Compose password. It validates optional `apps/api/.env` if present. It never prints secrets, even when a check fails.

If file permissions fail, fix without changing credentials:

```bash
chmod 600 docker/.env docker/.env.full
# Only if present: chmod 600 apps/api/.env
node scripts/ec015-3-env-audit.mjs --local
```

If Compose password consistency fails, investigate shell overrides and existing credentials. **Do not regenerate docker/.env or docker/.env.full**, and never reset/migrate a persistent development DB as a troubleshooting shortcut. Existing database passwords cannot be rotated safely just by editing an environment file.

## Environment ownership

| File | Used by | Keep in Git? |
| --- | --- | --- |
| `docker/.env` | Existing PostgreSQL Compose service | No |
| `docker/.env.full` | API/Web development Compose overlay | No |
| `docker/.env.example` | Document PostgreSQL placeholder | Yes |
| `apps/api/.env` | Optional native Node API | No |
| `apps/api/.env.example` | Document native API settings | Yes |
| `apps/web/.env` | Not required by current Web implementation | No |

The Docker app receives DB/JWT/CSRF values as container environment variables. Docker admins can inspect a development container's environment; do not interpret this as a production secret-storage design. EC-015.5 will add CI-only secret injection and separate environment configuration if required.

## Security guidance

- Use **unique secrets** for JWT and CSRF; each >=32 unpredictable characters. Do not copy the same secret to both keys.
- Do not put secrets into `VITE_` variables, browser storage, Git commits, logs, screenshots, README examples, or Docker build args.
- Use different credentials for local development, tests, CI, and production.
- Keep existing volume passwords unchanged unless performing a planned database credential rotation.
- `--templates` checks tracked file names and ignore rules; it is **not** a full content-based Git secret scanner. Consider a specialized secret scanner in the CI/security phase.
- When rotating JWT/CSRF secrets, existing sessions and CSRF tokens can be invalidated; do so deliberately. The audit does not rotate them.

## Acceptance criteria

1. `node scripts/ec015-3-env-audit.mjs --templates` → `EC-015.3 ENV AUDIT PASS`.
2. `node scripts/ec015-3-env-audit.mjs --local` → `EC-015.3 ENV AUDIT PASS`.
3. `bash scripts/ec015-2-dev-stack.sh smoke` → 3 PASS checks, unchanged.
4. `git status --short` shows only the intended new example, script, and README files; **no actual `.env` secret staged**.

After successful execution, close EC-015.3 and continue to EC-015.4 — safe migration & seed automation.
