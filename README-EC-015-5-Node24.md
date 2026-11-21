# CommerceLab EC-015.5 — Node 24 Actions Warning Fix

The latest GitHub-hosted runners use Node.js 24 to run JavaScript **actions**. The current `.github/workflows/ci.yml` uses Node 20 action majors (`@v4`), causing a non-failing annotation. This does not require changing the project's tested Node.js version (`node-version: '22'`).

## Apply (from CommerceLab repository root)

```bash
node scripts/ec015-5-node24-actions.mjs apply
node scripts/ec015-5-node24-actions.mjs verify
node scripts/ec015-5-ci.mjs verify
git diff --check
git diff -- .github/workflows/ci.yml scripts/ec015-5-ci.mjs
```

Update exactly these action references in both the workflow and the checker:

- `actions/checkout@v4` -> `actions/checkout@v6`
- `pnpm/action-setup@v4` -> `pnpm/action-setup@v6`
- `actions/setup-node@v4` -> `actions/setup-node@v6`
- `actions/upload-artifact@v4` -> `actions/upload-artifact@v6`

The update is idempotent, refuses unexpected versions, makes no database changes, doesn't read or print `.env` values, and doesn't make a commit. It touches only these eight references in two files. If you have local edits in either file, review `git diff` before committing.

After checking the diff, stage and commit only the intended files:

```bash
git add .github/workflows/ci.yml scripts/ec015-5-ci.mjs scripts/ec015-5-node24-actions.mjs
git diff --cached --check
git diff --cached --stat
git commit -m "ci: upgrade GitHub Actions to Node 24 runtime"
git push
```

Then confirm the GitHub Actions job remains green and the Node.js 20 deprecation annotation disappears. This patch does **not** add PostgreSQL CI tests; that is EC-015.6.

References:
- https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
- https://github.com/actions/checkout/releases
- https://github.com/actions/setup-node/releases
- https://github.com/actions/upload-artifact/releases
- https://github.com/pnpm/action-setup/releases
