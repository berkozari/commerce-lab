# EC-016.1 — Documentation baseline audit

> Basis: source archive `commercelab-EC-015-1-infrastructure-audit.zip` and EC-015.2–EC-015.8 implementation packages prepared during this conversation, plus the user's successful CI/merge reports. This is a **baseline**, not a claim that the current remote `main` has been independently checked. Review the diff against the freshly merged branch.

## Findings

| Priority | File | Finding | EC-016 action |
| --- | --- | --- | --- |
| High | `README.md` | Still describes an EC-001 foundation and lists already implemented Prisma/auth/checkout/Docker/CI/OpenAPI as future work | Replace with a present-tense, accurate portfolio README (this package) |
| High | `docs/architecture.md` | Empty in the inspected source archive | Add architecture overview, backend layering, frontend state/data flow, auth and checkout flows (EC-016.2) |
| High | `docs/database.md` | Contains old text saying checkout is not yet implemented; migration history only lists two initial migrations | Reconcile with current schema and all **seven applied migrations** (EC-016.2) |
| Medium | `docs/DEV-001.md` | Historical initialization checklist, still unchecked and describes later work as deferred | Preserve as historical milestone record or move into an archive; don't present as current status |
| Medium | `apps/api/docs/openapi/openapi.yaml` | OpenAPI file exists and is mounted at `/api-docs` in non-production | Reconcile endpoint schemas with current route handlers (EC-016.2) |
| Medium | README visuals | No screenshots, customer walkthrough, or reviewed GIF/demo evidence in inspected archive | Add real screenshots only after capturing them from the working app (EC-016.3) |
| Medium | Local onboarding | Previous README only suggests `pnpm dev`, without Docker/environment/database guardrails | Document Docker and native modes, migrations and test commands (this package) |

## Scope / boundaries

- No application logic, database migrations, Docker or CI pipeline changes for EC-016.1.
- No new real-payment, production deployment, infrastructure monitoring, or unsupported feature claims.
- No fabricated screenshots, scores or badges.
- Use terms in actual code: `apps/api`, `apps/web`, PostgreSQL, Prisma, API `/api/v1`, Swagger UI `/api-docs`.
- EC-015 GitHub Actions success and merge were **reported by the user**; the remote run is not fetched directly in this audit.

## EC-016 roadmap (larger, coherent work packages)

1. **EC-016.1 — README and onboarding**: portfolio narrative, current features, accurate quickstart, environment hygiene, scripts, limitations, documentation inventory.
2. **EC-016.2 — Architecture, database and API**: Mermaid component/sequence/ER diagrams; backend/frontend boundaries; transaction and idempotency design; migration lineage; OpenAPI conformance review.
3. **EC-016.3 — Portfolio showcase and final review**: real screenshots and workflow overview, review consistency, internal links, spelling, security redaction, final PR/CI.

## Acceptance criteria for this package

- `git diff README.md` matches the implemented feature set (no speculative claims).
- Both native and Docker onboarding describe real scripts that exist in the checked-out branch.
- No tracked real secrets or `.env` values appear in changes.
- `node scripts/ec016-1-readme.mjs verify` passes.
- Existing CI workflow remains unchanged.
