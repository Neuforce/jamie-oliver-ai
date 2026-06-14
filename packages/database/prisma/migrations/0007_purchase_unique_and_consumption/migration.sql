-- Ensure purchase provider ids are unique and stamp one-time mandate consumption.

WITH ranked_purchases AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY provider, provider_purchase_id
      ORDER BY purchased_at ASC NULLS LAST, created_at ASC, ctid ASC
    ) AS row_num
  FROM purchases
  WHERE provider_purchase_id IS NOT NULL
)
DELETE FROM purchases p
USING ranked_purchases r
WHERE p.ctid = r.ctid
  AND r.row_num > 1;

DROP INDEX IF EXISTS "purchases_provider_provider_purchase_id_idx";

CREATE UNIQUE INDEX "purchases_provider_provider_purchase_id_key"
  ON "purchases"("provider", "provider_purchase_id");

ALTER TABLE "purchases"
  ADD COLUMN "mandate_consumed_at" TIMESTAMPTZ;
