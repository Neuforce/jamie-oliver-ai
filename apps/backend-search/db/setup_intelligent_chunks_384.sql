-- Intelligent recipe chunks for semantic search (Llama-generated)
-- Embedding dimension: 384

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS intelligent_recipe_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to recipe document
    recipe_id TEXT NOT NULL,

    -- Chunk content + idempotency
    chunk_text TEXT NOT NULL,
    chunk_hash TEXT NOT NULL,

    -- Llama metadata
    search_intent TEXT,
    llm_analysis JSONB,

    -- Vector search
    embedding VECTOR(384),

    -- Provenance
    file_path TEXT,
    file_hash VARCHAR(64),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotency: avoid duplicate chunk inserts per recipe
CREATE UNIQUE INDEX IF NOT EXISTS uq_chunks_recipe_hash
    ON intelligent_recipe_chunks (recipe_id, chunk_hash);

-- Fast filtering / joins
CREATE INDEX IF NOT EXISTS idx_chunks_recipe_id
    ON intelligent_recipe_chunks (recipe_id);

-- Optional text search for debugging / intent filtering
CREATE INDEX IF NOT EXISTS idx_chunks_search_intent
    ON intelligent_recipe_chunks (search_intent);

-- Vector index (ivfflat)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
    ON intelligent_recipe_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Keep updated_at current (optional)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at ON intelligent_recipe_chunks;
CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON intelligent_recipe_chunks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


