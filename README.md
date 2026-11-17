# CommerceLab

A local-first, full-stack e-commerce prototype for electronics, home & living, and accessories.

## Stack

- React + TypeScript + Vite (frontend)
- Node.js + Express 5 + TypeScript (API)
- pnpm workspaces (monorepo)

Planned in later milestones: PostgreSQL, Prisma, Redis, authentication, product catalog, shopping cart, checkout, admin dashboard, Docker, CI/CD and OpenAPI documentation.

## Requirements

- Node.js 24 LTS (recommended)
- pnpm installed (use your local pinned pnpm version and commit the generated lockfile)

## Get started

```bash
pnpm install
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3000/api/v1/health

The web development server proxies `/api` to the API on port `3000`.

## Checks

```bash
pnpm typecheck
pnpm build
pnpm lint
pnpm --filter @commercelab/api test
```

This is an EC-001 foundation, not the finished storefront.
