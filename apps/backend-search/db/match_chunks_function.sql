-- 1. Drop all existing versions of the function
DROP FUNCTION IF EXISTS match_recipe_chunks CASCADE;

-- 2. Create the function with the correct signature
CREATE OR REPLACE FUNCTION match_recipe_chunks(
    query_embedding VECTOR(384),
    recipe_id_filter TEXT,
    match_count INT DEFAULT 3
)
RETURNS TABLE (
    chunk_id UUID,
    recipe_id TEXT,
    chunk_text TEXT,
    search_intent TEXT,
    llm_analysis JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id AS chunk_id,
        c.recipe_id,
        c.chunk_text,
        c.search_intent,
        c.llm_analysis,
        (1 - (c.embedding <=> query_embedding))::FLOAT AS similarity
    FROM intelligent_recipe_chunks c
    WHERE c.recipe_id = recipe_id_filter
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_recipe_chunks IS 'Returns the most relevant chunks for a given recipe and query embedding';