-- EC-013.7.1 | Read-only PostgreSQL baseline, CommerceLab schema.
-- Run ONLY against the expected local environment (see README).
-- Does not expose stored user, order or token values.
\set ON_ERROR_STOP on
\pset pager off
\echo '=== EC-013.7.1 database identity ==='
SELECT current_database() AS database_name, current_user AS role_name, version() AS postgres_version;

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '5000ms';
SET LOCAL lock_timeout = '1000ms';

\echo '=== Table size and estimated row counts (statistics may be stale) ==='
SELECT c.relname AS table_name,
       c.reltuples::bigint AS estimated_rows,
       pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
       pg_size_pretty(pg_indexes_size(c.oid)) AS index_size,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('Product','ProductVariant','ProductImage','Category','Inventory','Cart','CartItem','Order','OrderItem','AuthSession')
ORDER BY pg_total_relation_size(c.oid) DESC, c.relname;

\echo '=== Index inventory ==='
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('Product','ProductVariant','ProductImage','Category','Inventory','Cart','CartItem','Order','OrderItem','AuthSession')
ORDER BY tablename, indexname;

\echo '=== Table access statistics (since last reset) ==='
SELECT relname AS table_name,
       n_live_tup AS estimated_live_rows,
       seq_scan, idx_scan,
       n_tup_ins, n_tup_upd, n_tup_del
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname IN ('Product','ProductVariant','ProductImage','Category','Inventory','Cart','CartItem','Order','OrderItem','AuthSession')
ORDER BY relname;

\echo '=== pg_stat_statements installed? (informational only) ==='
SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS pg_stat_statements_installed;

\echo '=== PLAN A: public catalog by recency, first page ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p.name, p.slug, p."createdAt"
FROM "Product" p
WHERE p.status = 'ACTIVE'
ORDER BY p."createdAt" DESC, p.id ASC
LIMIT 20 OFFSET 0;

\echo '=== PLAN B: public catalog by minimum active variant price ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id
FROM "Product" p
LEFT JOIN "ProductVariant" pv
       ON pv."productId" = p.id AND pv."isActive" = true
WHERE p.status = 'ACTIVE'
GROUP BY p.id
ORDER BY MIN(pv.price) ASC NULLS LAST, p.id ASC
LIMIT 20 OFFSET 0;

\echo '=== PLAN C: substring search (representative synthetic term) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id
FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND (p.name ILIKE '%test%' OR p.description ILIKE '%test%')
ORDER BY p."createdAt" DESC, p.id ASC
LIMIT 20 OFFSET 0;

\echo '=== PLAN D: filtered minimum/maximum price product listing ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id
FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM "ProductVariant" pv
    WHERE pv."productId" = p.id
      AND pv."isActive" = true
      AND pv.price BETWEEN 100 AND 1000
  )
ORDER BY p."createdAt" DESC, p.id ASC
LIMIT 20 OFFSET 0;

\echo '=== PLAN E: customer order history ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT o.id, o."createdAt", o.status
FROM "Order" o
WHERE o."userId" = (SELECT id FROM "User" ORDER BY "createdAt", id LIMIT 1)
ORDER BY o."createdAt" DESC
LIMIT 20 OFFSET 0;

\echo '=== PLAN F: cart items by created date ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT ci.id, ci."variantId", ci.quantity
FROM "CartItem" ci
WHERE ci."cartId" = (SELECT id FROM "Cart" ORDER BY "createdAt", id LIMIT 1)
ORDER BY ci."createdAt" ASC
LIMIT 20;

ROLLBACK;
\echo '=== EC-013.7.1 baseline complete (read-only) ==='
