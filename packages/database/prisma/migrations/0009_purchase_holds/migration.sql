-- Purchase hold FSM table for delayed commit/undo after authorization.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_hold_status') THEN
    CREATE TYPE "purchase_hold_status" AS ENUM ('holding','committed','undone','failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "purchase_holds" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID,
  "session_id" VARCHAR(255),
  "backend_recipe_id" VARCHAR(255) NOT NULL,
  "ask_id" UUID,
  "mandate_id" UUID,
  "price_amount" INTEGER NOT NULL,
  "currency_code" VARCHAR(8) NOT NULL DEFAULT 'USD',
  "status" "purchase_hold_status" NOT NULL DEFAULT 'holding',
  "hold_expires_at" TIMESTAMPTZ NOT NULL,
  "committed_at" TIMESTAMPTZ,
  "undone_at" TIMESTAMPTZ,
  "purchase_id" UUID,
  "tool_call_id" VARCHAR(128),
  "response_id" VARCHAR(128),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_holds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_holds_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "purchase_holds_ask_id_fkey" FOREIGN KEY ("ask_id")
    REFERENCES "spend_mandate_asks"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "purchase_holds_mandate_id_fkey" FOREIGN KEY ("mandate_id")
    REFERENCES "spend_mandates"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "purchase_holds_purchase_id_fkey" FOREIGN KEY ("purchase_id")
    REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "purchase_holds_session_id_idx"
  ON "purchase_holds"("session_id");
CREATE INDEX IF NOT EXISTS "purchase_holds_user_id_idx"
  ON "purchase_holds"("user_id");
CREATE INDEX IF NOT EXISTS "purchase_holds_status_idx"
  ON "purchase_holds"("status");
