# CommerceLab — API Contract and Documentation

> **Canonical specification:** [`apps/api/docs/openapi/openapi.yaml`](../apps/api/docs/openapi/openapi.yaml). This guide explains the behavior implemented in [`apps/api/src/routes`](../apps/api/src/routes). OpenAPI method/path coverage is checked by `node scripts/ec016-2-docs.mjs verify`; that does **not** prove full request/response schema conformance.

## Access and response conventions

- Base path: **`/api/v1`**. Development API: `http://127.0.0.1:3000/api/v1`; Swagger UI: `http://127.0.0.1:3000/api-docs` when `NODE_ENV` is not `production`.
- Swagger UI is configured with request submission disabled. It is documentation, not an interactive write console.
- Successes return a JSON envelope resembling `{ "success": true, "data": ... }`; errors use `success: false`, with an HTTP status reflecting the failure. Use the individual route/status behavior as authoritative.
- The React app uses same-origin `/api` requests with browser credentials. Vite proxies them to Express in local development.

## Authentication, cookies and CSRF

1. Call `GET /api/v1/auth/csrf` and preserve the returned CSRF cookie. Read `data.csrfToken` from the JSON response.
2. For state-changing requests, send `x-csrf-token` with that token and include browser credentials/cookies. The middleware also checks `Origin` and cross-site fetch metadata.
3. `POST /auth/login` or `/auth/register` sets HttpOnly access/refresh cookies. `POST /auth/refresh` rotates the refresh token; `/auth/logout` and `/auth/logout-all` revoke sessions. `GET /auth/me` requires authentication.
4. `requireRole("ADMIN")` protects administrator endpoints. A UI login or protected page alone is **not** authorization.

The OpenAPI cookie name `cl_access` represents **localhost development**. Production uses secure prefixed cookie names and HTTPS-only attributes; those production values must not be inferred from the development specification.

## Endpoint groups

| Group | Main paths | Notes |
| --- | --- | --- |
| Health | `GET /health`, `/health/live`, `/health/ready` | Readiness queries PostgreSQL and returns `503` if unavailable |
| Auth | `/auth/csrf`, `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/me` | Cookie sessions, CSRF, rate limits |
| Public catalog | `GET /categories`, `/products`, `/products/{slug}` | Active products, filtering, pagination, sorting |
| Catalog admin | `/admin/products`, `/admin/categories`, `/admin/inventory/{variantId}` and nested variants/images | Admin role for all; mutations also need CSRF |
| Cart | `/cart`, `/cart/items`, `/cart/items/{itemId}`, `/cart/merge` | Guest or authenticated cart; merge requires login |
| Checkout | `POST /checkout` | Auth, CSRF, `Idempotency-Key` required |
| Orders | `/orders`, `/orders/{id}`, `/orders/{id}/demo-payment` | Authenticated, ownership-restricted |
| Order admin | `GET /admin/orders`, `PATCH /admin/orders/{id}/status` | Admin role and valid state transitions |

Paths in this table are relative to `/api/v1`. For the complete set of operations and HTTP methods, use the OpenAPI file.

## Catalog filtering and pagination

Both public `GET /products` and admin `GET /admin/products` accept `page`, `limit`, `q`, `categoryId`, `minPrice`, `maxPrice` and `sort`. Supported sorts: `newest`, `oldest`, `name-asc`, `name-desc`, `price-asc`, `price-desc`. `minPrice` and `maxPrice` are nonnegative decimal strings with up to two fractional digits; min must not exceed max. Admin listing additionally accepts `status=DRAFT`, `status=ACTIVE` or `status=ARCHIVED`. The public endpoint shows active, sellable products as enforced by its service logic.

## Checkout idempotency and outcomes

- `POST /api/v1/checkout` requires a JSON `shippingAddress`, authenticated cookies, CSRF token and a 16–100-character URL-safe `Idempotency-Key` header.
- First successful order creation returns **201**, decreases stock transactionally and clears the cart. Repeated key with matching request fingerprint returns **200** and the stored order; a reused key with a different shipping-address fingerprint returns **409**.
- The client must not provide order totals or card numbers. The server uses live product prices and `Decimal` calculations. Payment is simulated via `POST /orders/{id}/demo-payment` with `{ "outcome": "success" }` or `{ "outcome": "failure" }`.
- A demo payment failure or a valid cancellation restores stock in the same transaction. Administrator status changes follow a constrained state machine; they are not arbitrary patches.

## Contract verification and limits

```bash
node scripts/ec016-2-docs.mjs verify
pnpm --filter @commercelab/api typecheck:tests
```

The EC-016.2 script checks that each statically declared HTTP route has a matching OpenAPI path/method, that the documented catalog filters/sorts match the currently supported options, and that all Prisma models and migrations have entries in the database guide. It deliberately does **not** validate runtime authorization, response bodies, error schemas or every Zod field. Existing Supertest and PostgreSQL integration suites remain responsible for runtime behavior.

Do not include real cookies, bearer tokens, payment card details, password hashes or live secrets in screenshots, documentation examples or issue reports.
