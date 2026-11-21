# CommerceLab — EC-016.1 README & Documentation Baseline

This package starts EC-016 after a successful EC-015 merge. It is based on the last locally inspected source ZIP; **review the resulting diff against the newest branch**.

## Contains
- `docs/drafts/EC-016-1-README.md`: a replacement README draft, in English for a portfolio audience.
- `docs/reviews/EC-016-1-documentation-audit.md`: source-grounded documentation gap inventory and larger EC-016 work packages.
- `scripts/ec016-1-readme.mjs`: conservative apply + verify script.

## Apply

Start on a newly created `feature/portfolio-documentation` branch from updated `main` (do not run on your old merged feature branch).

```bash
unzip -o "$HOME/Downloads/commerce-lab-EC-016-1-readme-doc-audit.zip" -d .
node scripts/ec016-1-readme.mjs apply
node scripts/ec016-1-readme.mjs verify

git diff --check
git diff -- README.md
git status --short
```

The apply script only replaces `README.md` if it still matches the **recognizable EC-001 stale baseline** (the historical README includes both `This is an EC-001 foundation` and `Planned in later milestones`). It keeps the original at `.reports/ec016-1/README.before.md` with owner-only permissions. It deletes the draft after applying, leaving the final README, docs audit, and apply script as tracked changes. If the current README differs, it **refuses to overwrite it**; compare the draft manually and reconcile rather than forcing a replacement.

## Review especially

1. Stack/runtime and actual feature list versus the current merged source.
2. Docker onboarding on a **fresh** database versus an existing volume (never rotate an existing volume's credentials by copying the example file).
3. Link targets, spelling, and README claims. There is no claim that the app is production-deployed or has a real payment processor.
4. Historical `docs/database.md` text is deliberately **not auto-overwritten** in this package; fix with up-to-date schema and seven migration files during EC-016.2.

## Optional lightweight quality check

```bash
node scripts/ec016-1-readme.mjs verify
git diff --check
```

No DB access, migrations, Docker restarts, data deletion, or CI workflow modifications occur. Review and commit when satisfied; do not push any `.env` file. Next: EC-016.2 architecture + database + OpenAPI reconciliation.
