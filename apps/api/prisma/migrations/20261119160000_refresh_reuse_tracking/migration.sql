-- Track one preceding refresh-token hash to distinguish replay from forged tokens.
-- Do not rewrite previously applied migrations.
ALTER TABLE "AuthSession"
  ADD COLUMN "previousRefreshTokenHash" VARCHAR(64),
  ADD COLUMN "previousRotatedAt" TIMESTAMP(3);
