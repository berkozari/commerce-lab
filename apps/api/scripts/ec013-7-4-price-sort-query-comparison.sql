-- CommerceLab EC-013.7.4: price-sort query alternatives.
-- Read-only analysis. ABORTS unless connected to the isolated commercelab_perf_test DB.
\set ON_ERROR_STOP on
\pset pager off
\echo '=== EC-013.7.4 database identity ==='
SELECT current_database() AS database_name, current_user AS role_name;

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';

DO $guard$
BEGIN
  IF current_database() <> 'commercelab_perf_test' THEN
    RAISE EXCEPTION 'ABORT: EC-013.7.4 may run only in commercelab_perf_test';
  END IF;
  IF (SELECT COUNT(*) FROM "Product") < 5000
     OR (SELECT COUNT(*) FROM "ProductVariant") < 10000 THEN
    RAISE EXCEPTION 'ABORT: isolated synthetic data missing; expected 5000 products and 10000 variants';
  END IF;
END
$guard$;

\echo '=== Exact seeded counts ==='
SELECT (SELECT COUNT(*) FROM "Product") AS products,
       (SELECT COUNT(*) FROM "ProductVariant") AS variants;

\echo '=== Verify all alternative queries produce precisely the same global product ordering (ASC and DESC, NULLS LAST) ==='
-- Compares entire ordered ID lists, not merely the first page, to catch pagination mismatches.
DO $verify$
DECLARE
  lateral_asc_equal boolean;
  lateral_desc_equal boolean;
  preagg_asc_equal boolean;
  preagg_desc_equal boolean;
BEGIN
  WITH baseline AS (
    SELECT p.id, MIN(pv.price) AS sort_price
    FROM "Product" p
    LEFT JOIN "ProductVariant" pv
      ON pv."productId" = p.id AND pv."isActive" = true
    WHERE p.status = 'ACTIVE'
    GROUP BY p.id
  ),
  lateral_version AS (
    SELECT p.id, price_info.sort_price
    FROM "Product" p
    LEFT JOIN LATERAL (
      SELECT MIN(pv.price) AS sort_price
      FROM "ProductVariant" pv
      WHERE pv."productId" = p.id AND pv."isActive" = true
    ) price_info ON true
    WHERE p.status = 'ACTIVE'
  ),
  preaggregated AS (
    SELECT p.id, price_info.sort_price
    FROM "Product" p
    LEFT JOIN (
      SELECT pv."productId", MIN(pv.price) AS sort_price
      FROM "ProductVariant" pv
      WHERE pv."isActive" = true
      GROUP BY pv."productId"
    ) price_info ON price_info."productId" = p.id
    WHERE p.status = 'ACTIVE'
  )
  SELECT
    ARRAY(SELECT id FROM baseline ORDER BY sort_price ASC NULLS LAST, id ASC)
      = ARRAY(SELECT id FROM lateral_version ORDER BY sort_price ASC NULLS LAST, id ASC),
    ARRAY(SELECT id FROM baseline ORDER BY sort_price DESC NULLS LAST, id ASC)
      = ARRAY(SELECT id FROM lateral_version ORDER BY sort_price DESC NULLS LAST, id ASC),
    ARRAY(SELECT id FROM baseline ORDER BY sort_price ASC NULLS LAST, id ASC)
      = ARRAY(SELECT id FROM preaggregated ORDER BY sort_price ASC NULLS LAST, id ASC),
    ARRAY(SELECT id FROM baseline ORDER BY sort_price DESC NULLS LAST, id ASC)
      = ARRAY(SELECT id FROM preaggregated ORDER BY sort_price DESC NULLS LAST, id ASC)
  INTO lateral_asc_equal, lateral_desc_equal, preagg_asc_equal, preagg_desc_equal;

  RAISE NOTICE 'lateral ASC=%, DESC=%; preaggregated ASC=%, DESC=%',
    lateral_asc_equal, lateral_desc_equal, preagg_asc_equal, preagg_desc_equal;
  IF NOT (lateral_asc_equal AND lateral_desc_equal AND preagg_asc_equal AND preagg_desc_equal) THEN
    RAISE EXCEPTION 'ABORT: alternative query differs from existing product ordering';
  END IF;
END
$verify$;

\echo '=== A1 original price ASC (same shape as catalog.service.ts) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id
FROM "Product" p
LEFT JOIN "ProductVariant" pv ON pv."productId" = p.id AND pv."isActive" = true
WHERE p.status = 'ACTIVE'
GROUP BY p.id
ORDER BY MIN(pv.price) ASC NULLS LAST, p.id ASC
LIMIT 20 OFFSET 0;

\echo '=== A2 lateral aggregate price ASC ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id
FROM "Product" p
LEFT JOIN LATERAL (
  SELECT MIN(pv.price) AS sort_price
  FROM "ProductVariant" pv
  WHERE pv."productId" = p.id AND pv."isActive" = true
) price_info ON true
WHERE p.status = 'ACTIVE'
ORDER BY price_info.sort_price ASC NULLS LAST, p.id ASC
LIMIT 20 OFFSET 0;

\echo '=== A3 preaggregated variants price ASC ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id
FROM "Product" p
LEFT JOIN (
  SELECT pv."productId", MIN(pv.price) AS sort_price
  FROM "ProductVariant" pv
  WHERE pv."isActive" = true
  GROUP BY pv."productId"
) price_info ON price_info."productId" = p.id
WHERE p.status = 'ACTIVE'
ORDER BY price_info.sort_price ASC NULLS LAST, p.id ASC
LIMIT 20 OFFSET 0;

\echo '=== B1 original price DESC ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id
FROM "Product" p
LEFT JOIN "ProductVariant" pv ON pv."productId" = p.id AND pv."isActive" = true
WHERE p.status = 'ACTIVE'
GROUP BY p.id
ORDER BY MIN(pv.price) DESC NULLS LAST, p.id ASC
LIMIT 20 OFFSET 0;

\echo '=== B2 lateral aggregate price DESC ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id
FROM "Product" p
LEFT JOIN LATERAL (
  SELECT MIN(pv.price) AS sort_price
  FROM "ProductVariant" pv
  WHERE pv."productId" = p.id AND pv."isActive" = true
) price_info ON true
WHERE p.status = 'ACTIVE'
ORDER BY price_info.sort_price DESC NULLS LAST, p.id ASC
LIMIT 20 OFFSET 0;

\echo '=== B3 preaggregated variants price DESC ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id
FROM "Product" p
LEFT JOIN (
  SELECT pv."productId", MIN(pv.price) AS sort_price
  FROM "ProductVariant" pv
  WHERE pv."isActive" = true
  GROUP BY pv."productId"
) price_info ON price_info."productId" = p.id
WHERE p.status = 'ACTIVE'
ORDER BY price_info.sort_price DESC NULLS LAST, p.id ASC
LIMIT 20 OFFSET 0;

ROLLBACK;
\echo '=== EC-013.7.4 price-sort comparison complete (read-only) ==='
