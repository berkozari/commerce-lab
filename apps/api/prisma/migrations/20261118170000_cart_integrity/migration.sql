DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Cart_exactly_one_owner' AND conrelid = '"Cart"'::regclass) THEN
    ALTER TABLE "Cart" ADD CONSTRAINT "Cart_exactly_one_owner" CHECK (
      ("userId" IS NOT NULL AND "guestTokenHash" IS NULL) OR
      ("userId" IS NULL AND "guestTokenHash" IS NOT NULL)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CartItem_quantity_positive' AND conrelid = '"CartItem"'::regclass) THEN
    ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_quantity_positive" CHECK ("quantity" > 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Cart_one_per_user_key" ON "Cart" ("userId") WHERE "userId" IS NOT NULL;
