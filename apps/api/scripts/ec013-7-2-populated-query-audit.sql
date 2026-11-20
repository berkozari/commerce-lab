-- EC-013.7.2 | Read-only populated-query and planner-statistics audit.
-- Intended for the local CommerceLab development DB only.
-- Produces no user identifiers or session/token values.
\set ON_ERROR_STOP on
\pset pager off
\echo '=== EC-013.7.2 database identity (expected: commercelab_dev) ==='
SELECT current_database() AS database_name, current_user AS role_name;

-- Reject incorrect database, regardless of what the shell command selected.
SELECT (current_database() = 'commercelab_dev')::int AS expected_db \gset
\if :expected_db
\else
  \echo 'ABORT: Expected database commercelab_dev. No audit executed.'
  \quit
\endif

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '5000ms';
SET LOCAL lock_timeout = '1000ms';

\echo '=== Exact counts for relevant tables ==='
SELECT (SELECT COUNT(*) FROM "Product") AS products,
       (SELECT COUNT(*) FROM "ProductVariant") AS variants,
       (SELECT COUNT(*) FROM "Order") AS orders,
       (SELECT COUNT(*) FROM "Cart") AS carts,
       (SELECT COUNT(*) FROM "CartItem") AS cart_items;

\echo '=== Planner statistics freshness ==='
SELECT relname AS table_name,
       last_analyze,
       last_autoanalyze,
       n_mod_since_analyze,
       n_live_tup AS estimated_live_rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname IN ('Product', 'ProductVariant', 'Order', 'Cart', 'CartItem')
ORDER BY relname;

\echo '=== Relevant index access counts (cumulative; not a recommendation to drop) ==='
SELECT relname AS table_name, indexrelname AS index_name, idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND relname IN ('Product','ProductVariant','Order','Cart','CartItem')
ORDER BY relname, indexrelname;

\echo '=== PLAN E2: order history for a customer who actually has orders ==='
SELECT EXISTS(SELECT 1 FROM "Order") AS has_orders \gset
\if :has_orders
EXPLAIN (ANALYZE, BUFFERS)
SELECT o.id, o."createdAt", o.status
FROM "Order" o
WHERE o."userId" = (
  SELECT user_orders."userId"
  FROM "Order" user_orders
  GROUP BY user_orders."userId"
  ORDER BY COUNT(*) DESC, user_orders."userId"
  LIMIT 1
)
ORDER BY o."createdAt" DESC
LIMIT 20 OFFSET 0;
\else
\echo 'SKIPPED PLAN E2: no orders currently exist; do not interpret as a performance pass.'
\endif

\echo '=== PLAN F2: cart item listing for a cart with items, only if any exist ==='
SELECT EXISTS(SELECT 1 FROM "CartItem") AS has_cart_items \gset
\if :has_cart_items
EXPLAIN (ANALYZE, BUFFERS)
SELECT ci.id, ci."variantId", ci.quantity
FROM "CartItem" ci
WHERE ci."cartId" = (
  SELECT populated_cart."cartId"
  FROM "CartItem" populated_cart
  GROUP BY populated_cart."cartId"
  ORDER BY COUNT(*) DESC, populated_cart."cartId"
  LIMIT 1
)
ORDER BY ci."createdAt" ASC
LIMIT 20;
\else
\echo 'SKIPPED PLAN F2: there are no CartItem rows. Use isolated seeded data later.'
\endif

ROLLBACK;
\echo '=== EC-013.7.2 audit complete (read-only) ==='
