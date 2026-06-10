-- Agentic Tab Payments: session spend mandates + provider webhook idempotency ledger.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'spend_mandate_status') THEN
    CREATE TYPE "spend_mandate_status" AS ENUM ('active','exhausted','expired','revoked');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "spend_mandates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "session_id" VARCHAR(255),
  "ceiling_amount" INTEGER NOT NULL,
  "currency_code" VARCHAR(10) NOT NULL DEFAULT 'USD',
  "consumed_amount" INTEGER NOT NULL DEFAULT 0,
  "status" "spend_mandate_status" NOT NULL DEFAULT 'active',
  "source" VARCHAR(32) NOT NULL DEFAULT 'voice',
  "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "spend_mandates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "spend_mandates_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "spend_mandates_user_id_status_idx"
  ON "spend_mandates"("user_id", "status");

CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" VARCHAR(32) NOT NULL DEFAULT 'supertab',
  "event_id" VARCHAR(255) NOT NULL,
  "event_type" VARCHAR(128) NOT NULL,
  "payload" JSONB NOT NULL,
  "processed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_events_provider_event_id_key" UNIQUE ("provider", "event_id")
);
