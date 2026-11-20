-- CommerceLab EC-013.7.8: OFFSET vs keyset pagination, same data and ordering.
-- READ ONLY. Intended ONLY for the isolated seeded commercelab_perf_test database.
-- This is a one-page comparison with an already-known cursor. It does NOT benchmark
-- obtaining the cursor or jumping randomly to page 201.
\set ON_ERROR_STOP on
\pset pager off
\echo '=== EC-013.7.8: expected database commercelab_perf_test ==='
SELECT current_database() AS database_name, current_user AS role_name;

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';
SET LOCAL jit = off;

DO $guard$
DECLARE active_count bigint;
BEGIN
  IF current_database() <> 'commercelab_perf_test' THEN
    RAISE EXCEPTION 'ABORT: EC-013.7.8 runs only on commercelab_perf_test';
  END IF;
  SELECT count(*) INTO active_count FROM public."Product" WHERE status = 'ACTIVE';
  IF active_count < 4020 THEN
    RAISE EXCEPTION 'ABORT: need at least 4020 active products (found %)', active_count;
  END IF;
END
$guard$;

\echo '=== Cursor: last product of preceding page (OFFSET 3999) ==='
-- The previous page's final item becomes our cursor for the page starting OFFSET 4000.
-- psql variables receive values produced by the LOCAL, GUARDED performance database.
SELECT p."createdAt" AS cursor_created_at, p.id::text AS cursor_id
FROM public."Product" p
WHERE p.status = 'ACTIVE'
ORDER BY p."createdAt" DESC, p.id ASC
LIMIT 1 OFFSET 3999
\gset
\echo 'Cursor ID:' :cursor_id

\echo '=== Check page equality: OFFSET vs plain keyset and bounded keyset ==='
WITH offset_page AS (
  SELECT p.id, p."createdAt"
  FROM public."Product" p
  WHERE p.status = 'ACTIVE'
  ORDER BY p."createdAt" DESC, p.id ASC
  LIMIT 20 OFFSET 4000
), plain_page AS (
  SELECT p.id, p."createdAt"
  FROM public."Product" p
  WHERE p.status = 'ACTIVE'
    AND (p."createdAt" < :'cursor_created_at'
         OR (p."createdAt" = :'cursor_created_at' AND p.id > :'cursor_id'::uuid))
  ORDER BY p."createdAt" DESC, p.id ASC
  LIMIT 20
), bounded_page AS (
  SELECT p.id, p."createdAt"
  FROM public."Product" p
  WHERE p.status = 'ACTIVE'
    AND p."createdAt" <= :'cursor_created_at'
    AND (p."createdAt" < :'cursor_created_at'
         OR (p."createdAt" = :'cursor_created_at' AND p.id > :'cursor_id'::uuid))
  ORDER BY p."createdAt" DESC, p.id ASC
  LIMIT 20
), expected AS (
  SELECT id, row_number() OVER (ORDER BY "createdAt" DESC, id ASC) AS pos FROM offset_page
), plain AS (
  SELECT id, row_number() OVER (ORDER BY "createdAt" DESC, id ASC) AS pos FROM plain_page
), bounded AS (
  SELECT id, row_number() OVER (ORDER BY "createdAt" DESC, id ASC) AS pos FROM bounded_page
), comparison AS (
  SELECT count(expected.id)::integer AS offset_rows,
         count(plain.id)::integer AS plain_rows,
         count(bounded.id)::integer AS bounded_rows,
         count(*) FILTER (WHERE expected.id IS DISTINCT FROM plain.id)::integer AS plain_mismatches,
         count(*) FILTER (WHERE expected.id IS DISTINCT FROM bounded.id)::integer AS bounded_mismatches
  FROM expected
  FULL JOIN plain USING (pos)
  FULL JOIN bounded USING (pos)
)
SELECT *, (offset_rows = 20 AND plain_rows = 20 AND bounded_rows = 20
           AND plain_mismatches = 0 AND bounded_mismatches = 0) AS pagination_equal
FROM comparison
\gset
\echo 'OFFSET rows:' :offset_rows 'Plain rows:' :plain_rows 'Bounded rows:' :bounded_rows
\echo 'Plain mismatches:' :plain_mismatches 'Bounded mismatches:' :bounded_mismatches
\if :pagination_equal
  \echo 'PASS: all three methods return exactly the same 20 IDs in the same order'
\else
  \echo 'FAIL: pagination mismatch; do not change production code'
  \quit 1
\endif

\echo '=== PLAN A: first-page OFFSET (reference) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p."createdAt" FROM public."Product" p
WHERE p.status = 'ACTIVE'
ORDER BY p."createdAt" DESC, p.id ASC
LIMIT 20 OFFSET 0;

\echo '=== PLAN B: deep OFFSET 4000 ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p."createdAt" FROM public."Product" p
WHERE p.status = 'ACTIVE'
ORDER BY p."createdAt" DESC, p.id ASC
LIMIT 20 OFFSET 4000;

\echo '=== PLAN C: plain keyset after supplied cursor ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p."createdAt" FROM public."Product" p
WHERE p.status = 'ACTIVE'
  AND (p."createdAt" < :'cursor_created_at'
       OR (p."createdAt" = :'cursor_created_at' AND p.id > :'cursor_id'::uuid))
ORDER BY p."createdAt" DESC, p.id ASC
LIMIT 20;

\echo '=== PLAN D: keyset with a redundant upper-bound index condition ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p."createdAt" FROM public."Product" p
WHERE p.status = 'ACTIVE'
  AND p."createdAt" <= :'cursor_created_at'
  AND (p."createdAt" < :'cursor_created_at'
       OR (p."createdAt" = :'cursor_created_at' AND p.id > :'cursor_id'::uuid))
ORDER BY p."createdAt" DESC, p.id ASC
LIMIT 20;

ROLLBACK;
\echo '=== EC-013.7.8 finished: read-only comparison complete ==='
