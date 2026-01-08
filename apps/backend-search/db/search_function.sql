-- Función de búsqueda híbrida para recetas
-- Combina: vector similarity + filtros exactos + full-text search en ingredientes

CREATE OR REPLACE FUNCTION hybrid_recipe_search(
    query_embedding VECTOR(384),
    query_text TEXT DEFAULT NULL,
    filter_category VARCHAR(100) DEFAULT NULL,
    filter_mood VARCHAR(100) DEFAULT NULL,
    filter_complexity VARCHAR(50) DEFAULT NULL,
    filter_cost VARCHAR(50) DEFAULT NULL,
    match_count INT DEFAULT 10,
    similarity_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
    recipe_id VARCHAR(255),
    title TEXT,
    category VARCHAR(100),
    mood VARCHAR(100),
    complexity VARCHAR(50),
    cost VARCHAR(50),
    ingredients_text TEXT,
    file_path VARCHAR(500),
    similarity_score FLOAT,
    ingredient_rank FLOAT,
    combined_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH vector_matches AS (
        -- Búsqueda vectorial en chunks: encuentra recetas semánticamente similares
        SELECT 
            c.recipe_id,
            MAX((1 - (c.embedding <=> query_embedding))::FLOAT) AS similarity
        FROM intelligent_recipe_chunks c
        WHERE (1 - (c.embedding <=> query_embedding))::FLOAT > similarity_threshold
        GROUP BY c.recipe_id
    ),
    filtered_recipes AS (
        -- Combina búsqueda vectorial con filtros exactos
        SELECT 
            r.id,
            r.title,
            r.category,
            r.mood,
            r.complexity,
            r.cost,
            r.ingredients_text,
            r.file_path,
            COALESCE(vm.similarity, 0::FLOAT)::FLOAT AS similarity_score,
            -- Full-text search en ingredientes (si query_text está presente)
            CASE 
                WHEN query_text IS NOT NULL AND query_text != '' THEN
                    ts_rank(
                        to_tsvector('english', COALESCE(r.ingredients_text, '')), 
                        plainto_tsquery('english', query_text)
                    )::FLOAT
                ELSE 0::FLOAT
            END AS ingredient_rank
        FROM recipe_index r
        LEFT JOIN vector_matches vm ON vm.recipe_id = r.id
        WHERE 
            -- Aplicar filtros exactos (solo si están presentes)
            (filter_category IS NULL OR r.category = filter_category)
            AND (filter_mood IS NULL OR r.mood = filter_mood)
            AND (filter_complexity IS NULL OR r.complexity = filter_complexity)
            AND (filter_cost IS NULL OR r.cost = filter_cost)
            -- Debe haber al menos un match vectorial O de ingredientes
            AND (vm.similarity IS NOT NULL OR (query_text IS NOT NULL AND query_text != ''))
    )
    SELECT 
        fr.id AS recipe_id,
        fr.title,
        fr.category,
        fr.mood,
        fr.complexity,
        fr.cost,
        fr.ingredients_text,
        fr.file_path,
        fr.similarity_score,
        fr.ingredient_rank,
        -- Score combinado: 80% vector + 20% ingredientes
        -- (ajustable según necesidades)
        (fr.similarity_score * 0.8 + fr.ingredient_rank * 0.2)::FLOAT AS combined_score
    FROM filtered_recipes fr
    WHERE 
        -- Solo retornar resultados con score mínimo
        (fr.similarity_score * 0.8 + fr.ingredient_rank * 0.2)::FLOAT > 0.1
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$;

-- Crear índice en ingredients_text para FTS (si no existe)
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_fts 
ON recipe_index 
USING gin (to_tsvector('english', COALESCE(ingredients_text, '')));

-- Comentarios para documentación
COMMENT ON FUNCTION hybrid_recipe_search IS 'Búsqueda híbrida de recetas: combina vector similarity (80%), full-text search en ingredientes (20%) y filtros exactos (category, mood, complexity, cost)';

