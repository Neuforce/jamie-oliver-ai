-- Auditable receipts for agent action decisions.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_action_kind') THEN
    CREATE TYPE "agent_action_kind" AS ENUM ('read','write');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_action_channel') THEN
    CREATE TYPE "agent_action_channel" AS ENUM ('chat','voice','auto');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_action_outcome') THEN
    CREATE TYPE "agent_action_outcome" AS ENUM ('accept','decline','cancel');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "agent_action_receipts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID,
  "session_id" VARCHAR(255),
  "action_name" VARCHAR(128) NOT NULL,
  "kind" "agent_action_kind" NOT NULL,
  "channel" "agent_action_channel" NOT NULL,
  "outcome" "agent_action_outcome" NOT NULL,
  "decision_detail" TEXT,
  "backend_recipe_id" VARCHAR(255),
  "ask_id" UUID,
  "standing_authorization_mandate_id" UUID,
  "tool_call_id" VARCHAR(128),
  "response_id" VARCHAR(128),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_action_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_action_receipts_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "agent_action_receipts_ask_id_fkey" FOREIGN KEY ("ask_id")
    REFERENCES "spend_mandate_asks"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "agent_action_receipts_standing_authorization_mandate_id_fkey" FOREIGN KEY ("standing_authorization_mandate_id")
    REFERENCES "spend_mandates"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "agent_action_receipts_user_id_idx"
  ON "agent_action_receipts"("user_id");
CREATE INDEX IF NOT EXISTS "agent_action_receipts_session_id_idx"
  ON "agent_action_receipts"("session_id");
CREATE INDEX IF NOT EXISTS "agent_action_receipts_action_name_idx"
  ON "agent_action_receipts"("action_name");
