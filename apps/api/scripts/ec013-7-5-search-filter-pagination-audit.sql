-- CommerceLab EC-013.7.5 | Search selectivity, price filters, and deep pagination audit.
-- Read-only analysis. Never run against commercelab_dev or a production/shared database.
\set ON_ERROR_STOP on
\pset pager off
\echo '=== EC-013.7.5: database identity (expected commercelab_perf_test) ==='
SELECT current_database() AS database_name, current_user AS role_name;

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';

DO $guard$
BEGIN
  IF current_database() <> 'commercelab_perf_test' THEN
    RAISE EXCEPTION 'ABORT: this audit runs only on commercelab_perf_test';
  END IF;
  IF (SELECT COUNT(*) FROM "Product") < 5000
     OR (SELECT COUNT(*) FROM "ProductVariant") < 10000 THEN
    RAISE EXCEPTION 'ABORT: seeded performance data not found (expected at least 5000 products and 10000 variants)';
  END IF;
END
$guard$;

\echo '=== Dataset cardinality and term selectivity ==='
SELECT COUNT(*) AS active_products,
       COUNT(*) FILTER (WHERE name ILIKE '%sneaker%' OR description ILIKE '%sneaker%') AS sneaker_matches,
       COUNT(*) FILTER (WHERE name ILIKE '%product%' OR description ILIKE '%product%') AS product_matches,
       COUNT(*) FILTER (WHERE name ILIKE '%waterproof%' OR description ILIKE '%waterproof%') AS waterproof_matches,
       COUNT(*) FILTER (WHERE name ILIKE '%unlikelykeyword987654%' OR description ILIKE '%unlikelykeyword987654%') AS no_match_matches
FROM "Product"
WHERE status = 'ACTIVE';

\echo '=== PLAN S1: common word search (product) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND (p.name ILIKE '%product%' OR p.description ILIKE '%product%')
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

\echo '=== PLAN S2: medium-selectivity search (sneaker) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND (p.name ILIKE '%sneaker%' OR p.description ILIKE '%sneaker%')
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

\echo '=== PLAN S3: no-match substring search (worst-case candidate) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND (p.name ILIKE '%unlikelykeyword987654%' OR p.description ILIKE '%unlikelykeyword987654%')
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

\echo '=== PLAN P1: narrow variant price band 2490..2495 ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM "ProductVariant" pv
    WHERE pv."productId" = p.id AND pv."isActive" = true
      AND pv.price BETWEEN 2490 AND 2495
  )
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

\echo '=== PLAN P2: broad variant price band 100..2600 ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM "ProductVariant" pv
    WHERE pv."productId" = p.id AND pv."isActive" = true
      AND pv.price BETWEEN 100 AND 2600
  )
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

\echo '=== PLAN D1: deep OFFSET on newest active products ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p."createdAt" FROM "Product" p
WHERE p.status = 'ACTIVE'
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 4000;

\echo '=== PLAN D2: first page as pagination baseline ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p."createdAt" FROM "Product" p
WHERE p.status = 'ACTIVE'
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

ROLLBACK;
\echo '=== EC-013.7.5 search/filter/pagination audit complete (read-only) ==='
