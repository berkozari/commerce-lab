-- EC-002 database integrity hardening.
-- Apply after 20261117135558_init_ecommerce. Intended for the dedicated CommerceLab database.
-- Pre-existing invalid rows must be corrected before this migration can succeed.

ALTER TABLE "Inventory"
    ADD CONSTRAINT "Inventory_quantity_nonnegative" CHECK ("quantity" >= 0);

ALTER TABLE "CartItem"
    ADD CONSTRAINT "CartItem_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "OrderItem"
    ADD CONSTRAINT "OrderItem_quantity_positive" CHECK ("quantity" > 0),
    ADD CONSTRAINT "OrderItem_unitPrice_nonnegative" CHECK ("unitPrice" >= 0),
    ADD CONSTRAINT "OrderItem_totalPrice_nonnegative" CHECK ("totalPrice" >= 0);

ALTER TABLE "ProductVariant"
    ADD CONSTRAINT "ProductVariant_price_nonnegative" CHECK ("price" >= 0);

ALTER TABLE "Order"
    ADD CONSTRAINT "Order_subtotal_nonnegative" CHECK ("subtotal" >= 0),
    ADD CONSTRAINT "Order_shippingAmount_nonnegative" CHECK ("shippingAmount" >= 0),
    ADD CONSTRAINT "Order_total_nonnegative" CHECK ("total" >= 0);

ALTER TABLE "ProductImage"
    ADD CONSTRAINT "ProductImage_position_nonnegative" CHECK ("position" >= 0);

-- A cart belongs either to an authenticated user or to a guest token, never both/neither.
ALTER TABLE "Cart"
    ADD CONSTRAINT "Cart_exactly_one_owner" CHECK (
        ("userId" IS NOT NULL AND "guestTokenHash" IS NULL)
        OR
        ("userId" IS NULL AND "guestTokenHash" IS NOT NULL)
    );

-- Only one persisted cart per authenticated user in the MVP.
CREATE UNIQUE INDEX "Cart_one_per_user_key" ON "Cart" ("userId")
    WHERE "userId" IS NOT NULL;
