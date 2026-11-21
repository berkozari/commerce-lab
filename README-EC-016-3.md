# EC-016.3 — Screenshots, Showcase & Final Review

The package captures **real React UI** via Playwright and a deterministic **mock API**; there are no generated/fabricated screenshots. All captured identities and orders are synthetic. The tool never connects to PostgreSQL, migrates, seeds, resets, or touches Docker volumes.

## Apply

From a clean or committed `feature/portfolio-documentation` working tree, at the **CommerceLab repository root**:

```bash
unzip -o "$HOME/Downloads/commerce-lab-EC-016-3-showcase.zip" -d .
node scripts/ec016-3-showcase.mjs setup
node scripts/ec016-3-showcase.mjs check
```

This adds `apps/web/playwright.showcase.config.ts`, `apps/web/vite.config.showcase.ts`, `apps/web/e2e/showcase.e2e.ts`, `docs/showcase.md`, and `scripts/ec016-3-showcase.mjs`. The `setup` command adds both the new Playwright and isolated Vite configs to `apps/web/tsconfig.e2e.json` safely. No existing files are overwritten by this package. If any of those five paths already exists, inspect and reconcile before extracting with `-o`.

## Screenshot capture — isolated Vite and synthetic data

No running local API or database is required. Unlike the Docker or native development servers on `5173`, this launches its own temporary Vite process on **127.0.0.1:5191**. Stop anything already listening on 5191 before running.

```bash
pnpm --filter @commercelab/web exec playwright install chromium
pnpm --filter @commercelab/web exec playwright test --config playwright.showcase.config.ts
```

Expected: 1 showcase Playwright test passes; eight PNGs appear under `docs/assets/screenshots/`.

## Publish README gallery only when screenshots exist

```bash
node scripts/ec016-3-showcase.mjs publish
node scripts/ec016-3-showcase.mjs verify
pnpm lint
pnpm --filter @commercelab/web typecheck
pnpm --filter @commercelab/web typecheck:e2e
node scripts/ec016-2-docs.mjs verify
node scripts/ec016-1-readme.mjs verify
git diff --check
```

`publish` is idempotent. It inserts a README gallery near the top (or at the end when needed) only when all eight PNGs are readable. It also updates the two completed EC-016 roadmap checkboxes in the earlier README if they are present. It does not rewrite unrelated README content.

**Human review required:** open all eight screenshots, check responsive behavior, absence of real personal data/secrets, spelling, layout, correct labels, and README claims. Automation cannot verify design quality.

## Commit & push only after reviewing

```bash
git status --short
git add README.md docs/showcase.md docs/assets/screenshots \
  apps/web/playwright.showcase.config.ts apps/web/vite.config.showcase.ts \
  apps/web/e2e/showcase.e2e.ts \
  apps/web/tsconfig.e2e.json \
  scripts/ec016-3-showcase.mjs
git diff --cached --check
git diff --cached --stat
git commit -m "docs: add reproducible storefront showcase and final portfolio gallery"
git push -u origin feature/portfolio-documentation
```

If EC-016.1 or EC-016.2 changes are still uncommitted, include and review those as well; do not omit them from the final PR.

After the CI quality job and PostgreSQL integration job both pass, review the final PR and merge `feature/portfolio-documentation` into `main`.

## Limitations

The reference repository available during package creation predates the newest merge. The screenshot test reuses the exact `mockApi` and selectors from its existing browser E2E tests. If your current UI changed after that snapshot, inspect the failure and adapt selectors; do not loosen assertions or silently capture an error page. The screenshots are created **on your machine**; this package deliberately ships no pre-rendered images.
