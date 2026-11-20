-- CommerceLab EC-013.7.6 - Trigram search index experiment.
-- Experimental DDL only: CREATE EXTENSION and CREATE INDEX run inside a single
-- transaction that is always rolled back. Do not run on development or production DB.
-- Intended DB: commercelab_perf_test (previously seeded with 5,000 products).
\set ON_ERROR_STOP on
\pset pager off
\echo '=== EC-013.7.6: target database identity ==='
SELECT current_database() AS database_name, current_user AS role_name;

BEGIN;
SET LOCAL statement_timeout = '45s';
SET LOCAL lock_timeout = '3s';

-- Abort before any DDL unless this is precisely the isolated performance DB.
DO $guard$
BEGIN
    IF current_database() <> 'commercelab_perf_test' THEN
        RAISE EXCEPTION 'ABORT: EC-013.7.6 requires commercelab_perf_test';
    END IF;
    IF (SELECT COUNT(*) FROM "Product") < 5000
       OR (SELECT COUNT(*) FROM "ProductVariant") < 10000 THEN
        RAISE EXCEPTION 'ABORT: expected synthetic dataset is missing';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
            'ec01376_product_name_trgm_test_idx',
            'ec01376_product_description_trgm_test_idx'
          )
    ) THEN
        RAISE EXCEPTION 'ABORT: experimental index name already exists';
    END IF;
END
$guard$;

\echo '=== Baseline: common term (product) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND (p.name ILIKE '%product%' OR p.description ILIKE '%product%')
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

\echo '=== Baseline: medium term (sneaker) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND (p.name ILIKE '%sneaker%' OR p.description ILIKE '%sneaker%')
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

\echo '=== Baseline: relatively rare term (waterproof) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND (p.name ILIKE '%waterproof%' OR p.description ILIKE '%waterproof%')
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

\echo '=== Baseline: no-match term ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND (p.name ILIKE '%unlikelykeyword987654%' OR p.description ILIKE '%unlikelykeyword987654%')
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

\echo '=== Create experimental pg_trgm GIN indexes (transactional: rollback at end) ==='
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "ec01376_product_name_trgm_test_idx"
    ON "Product" USING GIN (name gin_trgm_ops)
    WHERE status = 'ACTIVE';
CREATE INDEX "ec01376_product_description_trgm_test_idx"
    ON "Product" USING GIN (description gin_trgm_ops)
    WHERE status = 'ACTIVE';

\echo '=== Experimental index disk size (temporary) ==='
SELECT c.relname AS index_name,
       pg_size_pretty(pg_relation_size(c.oid)) AS index_size,
       pg_relation_size(c.oid) AS bytes
FROM pg_class c
WHERE c.relname IN (
    'ec01376_product_name_trgm_test_idx',
    'ec01376_product_description_trgm_test_idx'
)
ORDER BY c.relname;

\echo '=== With pg_trgm: common term (product) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND (p.name ILIKE '%product%' OR p.description ILIKE '%product%')
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

\echo '=== With pg_trgm: medium term (sneaker) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND (p.name ILIKE '%sneaker%' OR p.description ILIKE '%sneaker%')
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

\echo '=== With pg_trgm: relatively rare term (waterproof) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND (p.name ILIKE '%waterproof%' OR p.description ILIKE '%waterproof%')
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

\echo '=== With pg_trgm: no-match term ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id FROM "Product" p
WHERE p.status = 'ACTIVE'
  AND (p.name ILIKE '%unlikelykeyword987654%' OR p.description ILIKE '%unlikelykeyword987654%')
ORDER BY p."createdAt" DESC, p.id ASC LIMIT 20 OFFSET 0;

-- The extension/index creation will NOT persist.
ROLLBACK;
\echo '=== EC-013.7.6 completed: experimental schema changes rolled back ==='
