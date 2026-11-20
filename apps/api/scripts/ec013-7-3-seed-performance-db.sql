-- CommerceLab EC-013.7.3 | Synthetic performance dataset.
-- MUTATES ONLY a dedicated local DB named commercelab_perf_test.
-- Never run against commercelab_dev, production, or a shared DB.
\set ON_ERROR_STOP on
\pset pager off
\echo '=== EC-013.7.3: verify isolated performance database ==='
SELECT current_database() AS database_name, current_user AS role_name;

BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '3s';
DO $guard$
BEGIN
    IF current_database() <> 'commercelab_perf_test' THEN
        RAISE EXCEPTION 'ABORT: this script can run only in commercelab_perf_test';
    END IF;
    IF (SELECT COUNT(*) FROM "Category") > 0
       OR (SELECT COUNT(*) FROM "Product") > 0
       OR (SELECT COUNT(*) FROM "ProductVariant") > 0
       OR (SELECT COUNT(*) FROM "User") > 0
       OR (SELECT COUNT(*) FROM "Cart") > 0
       OR (SELECT COUNT(*) FROM "CartItem") > 0
       OR (SELECT COUNT(*) FROM "Order") > 0 THEN
        RAISE EXCEPTION 'ABORT: expected an empty migrated performance database; no data changed';
    END IF;
END
$guard$;

\echo '=== Seed 1 category, 5000 products, 10000 variants ==='
INSERT INTO "Category" (id, name, slug, "createdAt", "updatedAt")
VALUES (md5('ec013perf-category')::uuid, 'EC013 Perf Category', 'ec013perf-category', now(), now());

INSERT INTO "Product" (id, "categoryId", name, slug, description, status, "createdAt", "updatedAt")
SELECT md5('ec013perf-product-' || n)::uuid,
       md5('ec013perf-category')::uuid,
       CASE WHEN n % 13 = 0 THEN 'Sneaker Model ' || n
            WHEN n % 17 = 0 THEN 'Running Shoe Model ' || n
            ELSE 'Everyday Product Model ' || n END,
       'ec013perf-product-' || n,
       CASE WHEN n % 27 = 0 THEN 'Waterproof sneaker with durable materials.'
            ELSE 'Everyday product for synthetic database performance testing.' END,
       CASE WHEN n % 10 = 0 THEN 'DRAFT'::"ProductStatus"
            ELSE 'ACTIVE'::"ProductStatus" END,
       now() - n * interval '1 minute',
       now()
FROM generate_series(1, 5000) AS g(n);

INSERT INTO "ProductVariant" (id, "productId", sku, name, price, currency,
                              attributes, "isActive", "createdAt", "updatedAt")
SELECT md5('ec013perf-variant-' || n)::uuid,
       md5('ec013perf-product-' || ((n + 1) / 2))::uuid,
       'EC013PERF-SKU-' || n,
       CASE WHEN n % 2 = 0 THEN 'Large' ELSE 'Small' END,
       (100 + n % 2500)::numeric(12,2),
       'TRY', '{}'::jsonb,
       (n % 20 <> 0), now(), now()
FROM generate_series(1, 10000) AS g(n);

\echo '=== Seed 100 synthetic users, 50 carts, 1000 cart items, 2000 orders ==='
INSERT INTO "User" (id, email, "passwordHash", name, role, "createdAt", "updatedAt")
SELECT md5('ec013perf-user-' || n)::uuid,
       'ec013perf-user-' || n || '@example.test',
       '!synthetic-performance-only-not-a-valid-password-hash!',
       'EC013 Perf User ' || n,
       'CUSTOMER'::"UserRole", now(), now()
FROM generate_series(1, 100) AS g(n);

INSERT INTO "Cart" (id, "userId", "guestTokenHash", "createdAt", "updatedAt")
SELECT md5('ec013perf-cart-' || n)::uuid,
       md5('ec013perf-user-' || n)::uuid,
       NULL, now() - n * interval '1 minute', now()
FROM generate_series(1, 50) AS g(n);

INSERT INTO "CartItem" (id, "cartId", "variantId", quantity, "createdAt", "updatedAt")
SELECT md5('ec013perf-cart-item-' || n)::uuid,
       md5('ec013perf-cart-' || (1 + (n - 1) / 20))::uuid,
       md5('ec013perf-variant-' || n)::uuid,
       1 + n % 3,
       now() - n * interval '1 second', now()
FROM generate_series(1, 1000) AS g(n);

INSERT INTO "Order" (id, "userId", "orderNumber", "idempotencyKey", "checkoutFingerprint",
                     status, "paymentStatus", subtotal, "shippingAmount", total,
                     currency, "shippingAddressSnapshot", "createdAt", "updatedAt")
SELECT md5('ec013perf-order-' || n)::uuid,
       md5('ec013perf-user-' || (1 + (n - 1) % 100))::uuid,
       'EC013PERF-' || lpad(n::text, 7, '0'),
       'ec013perf-idempotency-' || n,
       NULL,
       CASE WHEN n % 5 = 0 THEN 'PENDING'::"OrderStatus"
            ELSE 'CONFIRMED'::"OrderStatus" END,
       CASE WHEN n % 5 = 0 THEN 'UNPAID'::"PaymentStatus"
            ELSE 'PAID_DEMO'::"PaymentStatus" END,
       299.00, 0.00, 299.00,
       'TRY', '{"city":"Synthetic Test City"}'::jsonb,
       now() - n * interval '1 minute', now()
FROM generate_series(1, 2000) AS g(n);

COMMIT;
\echo '=== Refresh planner statistics on isolated DB only ==='
ANALYZE "Category";
ANALYZE "Product";
ANALYZE "ProductVariant";
ANALYZE "User";
ANALYZE "Cart";
ANALYZE "CartItem";
ANALYZE "Order";

\echo '=== Exact seeded row counts ==='
SELECT (SELECT COUNT(*) FROM "Product") AS products,
       (SELECT COUNT(*) FROM "ProductVariant") AS variants,
       (SELECT COUNT(*) FROM "User") AS users,
       (SELECT COUNT(*) FROM "Cart") AS carts,
       (SELECT COUNT(*) FROM "CartItem") AS cart_items,
       (SELECT COUNT(*) FROM "Order") AS orders;
\echo '=== EC-013.7.3 isolated synthetic seed complete ==='
