-- Server-side spend mandate consent asks (NEU-670)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'spend_mandate_ask_status') THEN
    CREATE TYPE "spend_mandate_ask_status" AS ENUM ('requested','active','declined','expired');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "spend_mandate_asks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID,
  "session_id" VARCHAR(255),
  "backend_recipe_id" VARCHAR(255) NOT NULL,
  "price_amount" INTEGER NOT NULL,
  "currency_code" VARCHAR(10) NOT NULL DEFAULT 'USD',
  "ceiling_amount" INTEGER NOT NULL,
  "status" "spend_mandate_ask_status" NOT NULL DEFAULT 'requested',
  "mandate_id" UUID,
  "tool_call_id" VARCHAR(128),
  "response_id" VARCHAR(128),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "spend_mandate_asks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "spend_mandate_asks_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "spend_mandate_asks_mandate_id_fkey" FOREIGN KEY ("mandate_id")
    REFERENCES "spend_mandates"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "spend_mandate_asks_user_id_status_idx"
  ON "spend_mandate_asks"("user_id", "status");
CREATE INDEX IF NOT EXISTS "spend_mandate_asks_session_id_status_idx"
  ON "spend_mandate_asks"("session_id", "status");
