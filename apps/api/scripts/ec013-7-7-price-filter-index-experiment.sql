-- CommerceLab EC-013.7.7 - Active variant price filter B-tree index experiment.
-- Runs ONLY in the isolated seeded commercelab_perf_test database.
-- Index creation is transactional: ROLLBACK removes it. No production schema changes.
\set ON_ERROR_STOP on
\pset pager off

\echo '=== EC-013.7.7: target database identity ==='
SELECT current_database() AS database_name, current_user AS role_name;

BEGIN;
SET LOCAL statement_timeout = '45s';
SET LOCAL lock_timeout = '3s';
SET LOCAL jit = off;

DO $guard$
BEGIN
  IF current_database() <> 'commercelab_perf_test' THEN
    RAISE EXCEPTION 'ABORT: EC-013.7.7 requires commercelab_perf_test';
  END IF;
  IF (SELECT COUNT(*) FROM "Product") < 5000
     OR (SELECT COUNT(*) FROM "ProductVariant") < 10000 THEN
    RAISE EXCEPTION 'ABORT: expected seeded performance dataset is missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'ec01377_active_variant_price_product_idx'
  ) THEN
    RAISE EXCEPTION 'ABORT: experimental index already exists';
  END IF;
END
$guard$;

\echo '=== Matching active variants: narrow vs broad price bands ==='
SELECT
  COUNT(*) FILTER (WHERE "isActive" AND price BETWEEN 2490 AND 2495) AS narrow_variants,
  COUNT(*) FILTER (WHERE "isActive" AND price BETWEEN 100 AND 2600) AS broad_variants
FROM "ProductVariant";

\echo '=== BASELINE N1: narrow price range, no experimental index ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM "ProductVariant" pv
    WHERE pv."productId" = p.id
      AND pv."isActive" = true
      AND pv.price BETWEEN 2490 AND 2495
  )
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

\echo '=== BASELINE B1: broad price range, no experimental index ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM "ProductVariant" pv
    WHERE pv."productId" = p.id
      AND pv."isActive" = true
      AND pv.price BETWEEN 100 AND 2600
  )
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

\echo '=== Create experimental partial price index (rollback at end) ==='
CREATE INDEX "ec01377_active_variant_price_product_idx"
  ON "ProductVariant" (price, "productId")
  WHERE "isActive" = true;

\echo '=== Experimental index size ==='
SELECT c.relname AS index_name,
       pg_size_pretty(pg_relation_size(c.oid)) AS index_size,
       pg_relation_size(c.oid) AS bytes
FROM pg_class c
WHERE c.relname = 'ec01377_active_variant_price_product_idx';

\echo '=== WITH INDEX N2: narrow price range ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM "ProductVariant" pv
    WHERE pv."productId" = p.id
      AND pv."isActive" = true
      AND pv.price BETWEEN 2490 AND 2495
  )
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

\echo '=== WITH INDEX B2: broad price range ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND EXISTS (
    SELECT 1 FROM "ProductVariant" pv
    WHERE pv."productId" = p.id
      AND pv."isActive" = true
      AND pv.price BETWEEN 100 AND 2600
  )
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

ROLLBACK;
\echo '=== EC-013.7.7 completed: experimental index rolled back ==='
