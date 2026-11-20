-- EC-013.7.3 | Read-only query plan capture against dedicated synthetic performance DB.
\set ON_ERROR_STOP on
\pset pager off
\echo '=== EC-013.7.3: performance database identity ==='
SELECT current_database() AS database_name, current_user AS role_name;

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
DO $guard$
BEGIN
    IF current_database() <> 'commercelab_perf_test' THEN
        RAISE EXCEPTION 'ABORT: this analysis can run only in commercelab_perf_test';
    END IF;
    IF (SELECT COUNT(*) FROM "Product") < 5000
       OR (SELECT COUNT(*) FROM "ProductVariant") < 10000
       OR (SELECT COUNT(*) FROM "CartItem") < 1000
       OR (SELECT COUNT(*) FROM "Order") < 2000 THEN
        RAISE EXCEPTION 'ABORT: required synthetic test data is missing; run the seed first';
    END IF;
END
$guard$;

\echo '=== Dataset and statistics ==='
SELECT (SELECT COUNT(*) FROM "Product") AS products,
       (SELECT COUNT(*) FROM "ProductVariant") AS variants,
       (SELECT COUNT(*) FROM "CartItem") AS cart_items,
       (SELECT COUNT(*) FROM "Order") AS orders;
SELECT relname AS table_name, last_analyze, last_autoanalyze,
       n_mod_since_analyze, n_live_tup AS estimated_rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname IN ('Product','ProductVariant','Order','CartItem')
ORDER BY relname;

\echo '=== PLAN A: newest active products ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p.name, p.slug, p."createdAt"
FROM "Product" p
WHERE p.status = 'ACTIVE'
ORDER BY p."createdAt" DESC, p.id ASC
LIMIT 20 OFFSET 0;

\echo '=== PLAN B: lowest minimum active-variant price ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id
FROM "Product" p
LEFT JOIN "ProductVariant" pv
  ON pv."productId" = p.id AND pv."isActive" = true
WHERE p.status = 'ACTIVE'
GROUP BY p.id
ORDER BY MIN(pv.price) ASC NULLS LAST, p.id ASC
LIMIT 20 OFFSET 0;

\echo '=== PLAN C: substring catalog search for sneaker ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id
FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND (p.name ILIKE '%sneaker%' OR p.description ILIKE '%sneaker%')
ORDER BY p."createdAt" DESC, p.id ASC
LIMIT 20 OFFSET 0;

\echo '=== PLAN D: active-variant price-range filter ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id
FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM "ProductVariant" pv
    WHERE pv."productId" = p.id
      AND pv."isActive" = true
      AND pv.price BETWEEN 500 AND 600
  )
ORDER BY p."createdAt" DESC, p.id ASC
LIMIT 20 OFFSET 0;

\echo '=== PLAN E: populated customer order history ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT o.id, o."createdAt", o.status
FROM "Order" o
WHERE o."userId" = md5('ec013perf-user-1')::uuid
ORDER BY o."createdAt" DESC
LIMIT 20 OFFSET 0;

\echo '=== PLAN F: populated cart-item listing ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT ci.id, ci."variantId", ci.quantity
FROM "CartItem" ci
WHERE ci."cartId" = md5('ec013perf-cart-1')::uuid
ORDER BY ci."createdAt" ASC
LIMIT 20;

ROLLBACK;
\echo '=== EC-013.7.3 synthetic performance audit complete ==='
