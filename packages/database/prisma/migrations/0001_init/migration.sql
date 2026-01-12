-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "recipe_status" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "source_type" AS ENUM ('manual', 'scraped', 'imported', 'enhanced');

-- CreateTable
CREATE TABLE "recipes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "slug" VARCHAR(255) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "recipe_json" JSONB NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "status" "recipe_status" NOT NULL DEFAULT 'draft',
    "quality_score" SMALLINT,
    "source_url" TEXT,
    "source_type" "source_type" NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_versions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "recipe_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "recipe_json" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "change_summary" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recipes_slug_key" ON "recipes"("slug");

-- CreateIndex
CREATE INDEX "recipes_status_idx" ON "recipes"("status");

-- CreateIndex
CREATE INDEX "recipes_quality_score_idx" ON "recipes"("quality_score" DESC NULLS LAST);

-- CreateIndex
CREATE INDEX "recipes_published_at_idx" ON "recipes"("published_at" DESC NULLS LAST);

-- CreateIndex
CREATE INDEX "recipes_metadata_idx" ON "recipes" USING gin("metadata");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_versions_recipe_id_version_key" ON "recipe_versions"("recipe_id", "version");

-- CreateIndex
CREATE INDEX "recipe_versions_recipe_id_idx" ON "recipe_versions"("recipe_id");

-- CreateIndex
CREATE INDEX "recipe_versions_created_at_idx" ON "recipe_versions"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_recipe_id_fkey" 
    FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add recipe_uuid column to existing tables (if they exist)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_index') THEN
        ALTER TABLE "recipe_index" ADD COLUMN IF NOT EXISTS "recipe_uuid" UUID;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'intelligent_recipe_chunks') THEN
        ALTER TABLE "intelligent_recipe_chunks" ADD COLUMN IF NOT EXISTS "recipe_uuid" UUID;
    END IF;
END $$;

-- Trigger for auto-updating updated_at and version
CREATE OR REPLACE FUNCTION update_recipes_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    -- Auto-increment version when recipe_json changes
    IF NEW.recipe_json IS DISTINCT FROM OLD.recipe_json THEN
        NEW.version = OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recipes_updated_at_trigger ON recipes;
CREATE TRIGGER recipes_updated_at_trigger
    BEFORE UPDATE ON recipes
    FOR EACH ROW
    EXECUTE FUNCTION update_recipes_timestamp();

-- Helper function to get recipe by slug
CREATE OR REPLACE FUNCTION get_recipe_by_slug(p_slug VARCHAR)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT recipe_json INTO result
    FROM recipes
    WHERE slug = p_slug AND status = 'published';
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Comment tables
COMMENT ON TABLE recipes IS 'Single source of truth for all recipe data. Full JOAv0 JSON stored in recipe_json.';
COMMENT ON COLUMN recipes.slug IS 'URL-friendly unique identifier, e.g., mushroom-risotto';
COMMENT ON COLUMN recipes.recipe_json IS 'Full JOAv0 document with recipe, steps, ingredients';
COMMENT ON COLUMN recipes.metadata IS 'Denormalized fields extracted from recipe_json for fast queries';
COMMENT ON COLUMN recipes.quality_score IS 'Quality score 0-100 based on completeness of recipe data';
