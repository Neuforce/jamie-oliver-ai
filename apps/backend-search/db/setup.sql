-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Main recipe index table
CREATE TABLE recipe_index (
    id VARCHAR(255) PRIMARY KEY,          -- recipe_id
    title TEXT NOT NULL,
    category VARCHAR(100),
    mood VARCHAR(100),
    complexity VARCHAR(50),
    cost VARCHAR(50),
    ingredients_text TEXT,
    file_path VARCHAR(500) NOT NULL,
    file_hash VARCHAR(64),
    last_indexed TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for exact filters
CREATE INDEX idx_recipe_category ON recipe_index(category);
CREATE INDEX idx_recipe_mood ON recipe_index(mood);
CREATE INDEX idx_recipe_complexity ON recipe_index(complexity);

-- Indexes for exact filters
CREATE INDEX idx_recipe_category ON recipe_index(category);
CREATE INDEX idx_recipe_mood ON recipe_index(mood);
CREATE INDEX idx_recipe_complexity ON recipe_index(complexity);
CREATE INDEX idx_recipe_cost ON recipe_index(cost);
CREATE INDEX idx_recipe_ingredients_text ON recipe_index USING gin (to_tsvector('english', coalesce(ingredients_text, '')));

