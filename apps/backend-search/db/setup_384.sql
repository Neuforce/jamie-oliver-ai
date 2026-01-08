-- pgvector-based recipe index for MiniLM embeddings (384 dims)
-- This file is intended to be applied in Supabase SQL editor / migrations.

CREATE EXTENSION IF NOT EXISTS vector;

-- Main recipe index table
CREATE TABLE IF NOT EXISTS recipe_index (
    -- Core metadata
    id VARCHAR(255) PRIMARY KEY,          -- filename without .json (kebab-case)
    title TEXT NOT NULL,

    -- Exact match fields (for filtering)
    category VARCHAR(100),
    mood VARCHAR(100),
    complexity VARCHAR(50),
    cost VARCHAR(50),

    -- Ingredient filtering
    ingredients_text TEXT,               -- normalized plain text for ILIKE filters (v1)

    -- Vector search fields
    full_content_for_embedding TEXT,     -- structured text for embedding
    embedding VECTOR(384),               -- sentence-transformers MiniLM dimension

    -- Reference to source file
    file_path VARCHAR(500) NOT NULL,
    file_hash VARCHAR(64),
    last_indexed TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for exact filters
CREATE INDEX IF NOT EXISTS idx_recipe_category ON recipe_index(category);
CREATE INDEX IF NOT EXISTS idx_recipe_mood ON recipe_index(mood);
CREATE INDEX IF NOT EXISTS idx_recipe_complexity ON recipe_index(complexity);
CREATE INDEX IF NOT EXISTS idx_recipe_cost ON recipe_index(cost);

-- Optional index for ingredient contains filters (simple)
-- For better performance later, consider a generated tsvector + GIN index.
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_text ON recipe_index USING gin (to_tsvector('english', coalesce(ingredients_text, '')));

-- Vector index for similarity search (ivfflat)
-- NOTE: ivfflat requires ANALYZE and works best with tuned lists/probes.
CREATE INDEX IF NOT EXISTS idx_recipe_embedding ON recipe_index
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Hybrid search (vector similarity + exact filters + optional ingredient contains)
CREATE OR REPLACE FUNCTION semantic_recipe_search(
    query_embedding VECTOR(384),
    filter_category TEXT DEFAULT NULL,
    filter_mood TEXT DEFAULT NULL,
    filter_complexity TEXT DEFAULT NULL,
    filter_cost TEXT DEFAULT NULL,
    ingredient_query TEXT DEFAULT NULL,
    match_threshold FLOAT DEFAULT 0.7,
    match_count INTEGER DEFAULT 20
)
RETURNS TABLE (
    recipe_id VARCHAR,
    title TEXT,
    category TEXT,
    mood TEXT,
    complexity TEXT,
    cost TEXT,
    file_path TEXT,
    similarity FLOAT
)
LANGUAGE SQL
STABLE
AS $$
    SELECT
        id AS recipe_id,
        title,
        category,
        mood,
        complexity,
        cost,
        file_path,
        1 - (embedding <=> query_embedding) AS similarity
    FROM recipe_index
    WHERE
        (1 - (embedding <=> query_embedding)) > match_threshold
        AND (filter_category IS NULL OR category = filter_category)
        AND (filter_mood IS NULL OR mood = filter_mood)
        AND (filter_complexity IS NULL OR complexity = filter_complexity)
        AND (filter_cost IS NULL OR cost = filter_cost)
        AND (
            ingredient_query IS NULL
            OR coalesce(ingredients_text, '') ILIKE ('%' || ingredient_query || '%')
        )
    ORDER BY similarity DESC
    LIMIT match_count;
$$;


