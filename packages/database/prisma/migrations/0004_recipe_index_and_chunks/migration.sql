-- Search index + embedding chunks (required by ingest_json_recipes and recipe_search_agent).
-- Safe on empty projects: IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "recipe_index" (
    "id" VARCHAR(255) NOT NULL,
    "title" TEXT NOT NULL,
    "category" VARCHAR(100),
    "mood" VARCHAR(100),
    "complexity" VARCHAR(50),
    "cost" VARCHAR(50),
    "ingredients_text" TEXT,
    "full_content_for_embedding" TEXT,
    "file_path" VARCHAR(500) NOT NULL,
    "file_hash" VARCHAR(64),
    "last_indexed" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipe_uuid" UUID,

    CONSTRAINT "recipe_index_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "recipe_index_category_idx" ON "recipe_index"("category");
CREATE INDEX IF NOT EXISTS "recipe_index_mood_idx" ON "recipe_index"("mood");
CREATE INDEX IF NOT EXISTS "recipe_index_complexity_idx" ON "recipe_index"("complexity");
CREATE INDEX IF NOT EXISTS "recipe_index_cost_idx" ON "recipe_index"("cost");

CREATE TABLE IF NOT EXISTS "intelligent_recipe_chunks" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "recipe_id" TEXT NOT NULL,
    "recipe_uuid" UUID,
    "chunk_text" TEXT NOT NULL,
    "chunk_hash" TEXT NOT NULL,
    "search_intent" TEXT,
    "llm_analysis" JSONB,
    "embedding" vector(384),
    "file_path" TEXT,
    "file_hash" VARCHAR(64),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intelligent_recipe_chunks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "intelligent_recipe_chunks_recipe_id_chunk_hash_key"
    ON "intelligent_recipe_chunks"("recipe_id", "chunk_hash");
CREATE INDEX IF NOT EXISTS "intelligent_recipe_chunks_recipe_id_idx" ON "intelligent_recipe_chunks"("recipe_id");
CREATE INDEX IF NOT EXISTS "intelligent_recipe_chunks_search_intent_idx" ON "intelligent_recipe_chunks"("search_intent");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'intelligent_recipe_chunks_recipe_uuid_fkey'
    ) THEN
        ALTER TABLE "intelligent_recipe_chunks"
            ADD CONSTRAINT "intelligent_recipe_chunks_recipe_uuid_fkey"
            FOREIGN KEY ("recipe_uuid") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
