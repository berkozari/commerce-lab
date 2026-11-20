-- EC-013.1: repair constraints absent from the already-provisioned development DB.
-- Skip already present constraints; fail on invalid data instead of silently bypassing them.
-- Existing migrations remain unchanged.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Inventory_quantity_nonnegative' AND conrelid = '"Inventory"'::regclass
  ) THEN
    ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_quantity_nonnegative" CHECK ("quantity" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'OrderItem_quantity_positive' AND conrelid = '"OrderItem"'::regclass
  ) THEN
    ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_quantity_positive" CHECK ("quantity" > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'OrderItem_unitPrice_nonnegative' AND conrelid = '"OrderItem"'::regclass
  ) THEN
    ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_unitPrice_nonnegative" CHECK ("unitPrice" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'OrderItem_totalPrice_nonnegative' AND conrelid = '"OrderItem"'::regclass
  ) THEN
    ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_totalPrice_nonnegative" CHECK ("totalPrice" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ProductVariant_price_nonnegative' AND conrelid = '"ProductVariant"'::regclass
  ) THEN
    ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_price_nonnegative" CHECK ("price" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Order_subtotal_nonnegative' AND conrelid = '"Order"'::regclass
  ) THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_subtotal_nonnegative" CHECK ("subtotal" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Order_shippingAmount_nonnegative' AND conrelid = '"Order"'::regclass
  ) THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_shippingAmount_nonnegative" CHECK ("shippingAmount" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Order_total_nonnegative' AND conrelid = '"Order"'::regclass
  ) THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_total_nonnegative" CHECK ("total" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ProductImage_position_nonnegative' AND conrelid = '"ProductImage"'::regclass
  ) THEN
    ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_position_nonnegative" CHECK ("position" >= 0);
  END IF;
END $$;

