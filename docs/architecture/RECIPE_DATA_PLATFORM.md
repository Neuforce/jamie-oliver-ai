# Recipe Data Platform Architecture

> **Document Status**: Technical Design Document  
> **Created**: 2026-01-12  
> **Epic**: Recipe Data Platform - Supabase as Single Source of Truth

---

## Executive Summary

This document defines the architecture for establishing **Supabase as the single source of truth** for all recipe data in the Jamie Oliver AI platform. The design eliminates reliance on local JSON files, ensures data consistency across services, and introduces a recipe enhancement pipeline for automated quality improvement.

---

## 1. Problem Statement

### Current State Issues

| Issue | Impact | Severity |
|-------|--------|----------|
| Full recipe JSONs stored only in local files | No centralized data access | High |
| Frontend sends recipe payload to backend-voice | Stale data, unreliable sync | High |
| Backend-voice cannot independently fetch recipes | Single point of failure | High |
| `recipe_index` only stores metadata | Full JSON unavailable via API | Medium |
| Recipe quality is inconsistent | Poor agent behavior | Critical |
| No version control for recipes | Can't track changes | Medium |

### Current Data Flow (Problematic)

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Frontend   │────▶│  /public/recipes │     │   Supabase   │
│             │     │  (local JSON)    │     │              │
└─────────────┘     └──────────────────┘     │ recipe_index │
       │                                      │ (metadata)   │
       │ WebSocket (sends recipePayload)      │              │
       ▼                                      │ chunks       │
┌─────────────┐                              │ (embeddings) │
│ backend-    │◀───── NO direct access ─────▶│              │
│ voice       │                              └──────────────┘
└─────────────┘

Problems:
1. Recipe JSON duplicated in /public/recipes/ and /data/recipes/
2. Frontend must send full recipe payload to backend (error-prone)
3. Backend-voice cannot fetch recipes independently
4. Search returns file_path, requiring local file access
```

---

## 2. Target Architecture

### Design Principles

1. **Single Source of Truth**: Supabase `recipes` table is authoritative
2. **Service Independence**: Each service can fetch data directly
3. **API-First**: All data access through versioned REST/GraphQL APIs
4. **Version Control**: Track recipe versions for rollback capability
5. **Quality Gates**: Validate recipes before publishing

### Target Data Flow

```
                    ┌──────────────────────────────────────────────┐
                    │                 SUPABASE                      │
                    │                                               │
                    │  ┌─────────────────────────────────────────┐ │
                    │  │ recipes (NEW - Source of Truth)          │ │
                    │  │ - id (UUID)                              │ │
                    │  │ - slug (unique, URL-friendly)            │ │
                    │  │ - version (int, auto-increment)          │ │
                    │  │ - recipe_json (JSONB - full JOAv0)       │ │
                    │  │ - metadata (JSONB - computed fields)     │ │
                    │  │ - status (draft | published | archived)  │ │
                    │  │ - quality_score (0-100)                  │ │
                    │  │ - source_url (nullable)                  │ │
                    │  │ - created_at, updated_at, published_at   │ │
                    │  └─────────────────────────────────────────┘ │
                    │                                               │
                    │  ┌─────────────────────────────────────────┐ │
                    │  │ recipe_versions (NEW - History)          │ │
                    │  │ - id, recipe_id, version                 │ │
                    │  │ - recipe_json, metadata                  │ │
                    │  │ - change_summary, created_at             │ │
                    │  └─────────────────────────────────────────┘ │
                    │                                               │
                    │  ┌─────────────────────────────────────────┐ │
                    │  │ recipe_index (existing - for search)     │ │
                    │  │ - Denormalized for fast search           │ │
                    │  │ - Synced from recipes table              │ │
                    │  └─────────────────────────────────────────┘ │
                    │                                               │
                    │  ┌─────────────────────────────────────────┐ │
                    │  │ intelligent_recipe_chunks (existing)     │ │
                    │  │ - Semantic search embeddings             │ │
                    │  └─────────────────────────────────────────┘ │
                    └──────────────────────────────────────────────┘
                                         ▲
                                         │
         ┌───────────────────────────────┼───────────────────────────────┐
         │                               │                               │
         ▼                               ▼                               ▼
┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
│   Frontend      │           │  backend-search │           │  backend-voice  │
│                 │◀─────────▶│  (Recipe API)   │           │                 │
│ Fetches recipes │   REST    │                 │           │ Fetches recipes │
│ from API        │           │ Single API for  │           │ from Supabase   │
│                 │           │ all recipe ops  │           │ directly        │
└─────────────────┘           └─────────────────┘           └─────────────────┘
                                         ▲
                                         │
                    ┌────────────────────┴────────────────────┐
                    │     Recipe Enhancement Pipeline         │
                    │                                         │
                    │  ┌───────────────────────────────────┐ │
                    │  │  1. Web Crawler                   │ │
                    │  │     - Scrape Jamie Oliver website │ │
                    │  │     - Extract recipe data         │ │
                    │  └───────────────────────────────────┘ │
                    │                  ▼                      │
                    │  ┌───────────────────────────────────┐ │
                    │  │  2. LLM Structurer                │ │
                    │  │     - Convert to JOAv0 format     │ │
                    │  │     - Generate on_enter.say       │ │
                    │  │     - Add timer metadata          │ │
                    │  │     - Create semantic step IDs    │ │
                    │  └───────────────────────────────────┘ │
                    │                  ▼                      │
                    │  ┌───────────────────────────────────┐ │
                    │  │  3. Quality Validator             │ │
                    │  │     - Validate JSON schema        │ │
                    │  │     - Check required fields       │ │
                    │  │     - Score recipe quality        │ │
                    │  └───────────────────────────────────┘ │
                    │                  ▼                      │
                    │  ┌───────────────────────────────────┐ │
                    │  │  4. Supabase Uploader             │ │
                    │  │     - Upsert to recipes table     │ │
                    │  │     - Generate embeddings         │ │
                    │  │     - Sync search index           │ │
                    │  └───────────────────────────────────┘ │
                    └─────────────────────────────────────────┘
```

---

## 3. Database Schema

### 3.1 `recipes` Table (NEW)

```sql
-- Main recipe storage table (source of truth)
CREATE TABLE IF NOT EXISTS recipes (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Unique identifiers
    slug VARCHAR(255) UNIQUE NOT NULL,  -- URL-friendly: "mushroom-risotto"
    
    -- Version control
    version INTEGER NOT NULL DEFAULT 1,
    
    -- Core content
    recipe_json JSONB NOT NULL,  -- Full JOAv0 document
    
    -- Computed/denormalized metadata (from recipe_json)
    metadata JSONB NOT NULL DEFAULT '{}',
    -- {
    --   "title": "Mushroom Risotto",
    --   "total_time_minutes": 45,
    --   "servings": 4,
    --   "difficulty": "medium",
    --   "step_count": 8,
    --   "has_timers": true,
    --   "timer_count": 2,
    --   "ingredient_count": 12,
    --   "categories": ["dinner", "italian"],
    --   "moods": ["comfort", "impressive"],
    --   "image_url": "...",
    --   "quality_indicators": {
    --     "has_on_enter_say": true,
    --     "has_semantic_step_ids": true,
    --     "has_timer_steps": true,
    --     "has_detailed_instructions": true
    --   }
    -- }
    
    -- Lifecycle
    status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft, published, archived
    quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
    
    -- Provenance
    source_url TEXT,  -- Original URL if scraped
    source_type VARCHAR(50) DEFAULT 'manual',  -- manual, scraped, imported
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('draft', 'published', 'archived'))
);

-- Indexes
CREATE INDEX idx_recipes_slug ON recipes(slug);
CREATE INDEX idx_recipes_status ON recipes(status);
CREATE INDEX idx_recipes_quality ON recipes(quality_score DESC);
CREATE INDEX idx_recipes_metadata ON recipes USING gin(metadata);
CREATE INDEX idx_recipes_published ON recipes(published_at DESC) WHERE status = 'published';

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_recipes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recipes_updated_at
BEFORE UPDATE ON recipes
FOR EACH ROW EXECUTE FUNCTION update_recipes_updated_at();
```

### 3.2 `recipe_versions` Table (NEW)

```sql
-- Version history for recipes
CREATE TABLE IF NOT EXISTS recipe_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference to recipe
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    
    -- Snapshot of recipe at this version
    recipe_json JSONB NOT NULL,
    metadata JSONB NOT NULL,
    
    -- Change tracking
    change_summary TEXT,  -- "Updated step 3 instructions, added timer"
    changed_by VARCHAR(255),  -- User or system identifier
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(recipe_id, version)
);

CREATE INDEX idx_recipe_versions_recipe ON recipe_versions(recipe_id);
CREATE INDEX idx_recipe_versions_created ON recipe_versions(created_at DESC);
```

### 3.3 Update Existing Tables

```sql
-- Add foreign key to recipe_index (optional, for referential integrity)
ALTER TABLE recipe_index 
ADD COLUMN recipe_uuid UUID REFERENCES recipes(id);

-- Add foreign key to intelligent_recipe_chunks
ALTER TABLE intelligent_recipe_chunks 
ADD COLUMN recipe_uuid UUID REFERENCES recipes(id);
```

---

## 4. API Design

### 4.1 Recipe API v2 (backend-search)

#### List Recipes
```
GET /api/v2/recipes
Query params:
  - status: draft | published | archived (default: published)
  - category: string
  - mood: string
  - difficulty: string
  - min_quality: number (0-100)
  - limit: number (default: 50, max: 100)
  - offset: number (default: 0)
  - sort: created_at | updated_at | quality_score | title

Response:
{
  "items": [RecipeListItem],
  "total": number,
  "limit": number,
  "offset": number
}
```

#### Get Recipe
```
GET /api/v2/recipes/{slug}
Query params:
  - include_versions: boolean (default: false)

Response:
{
  "id": "uuid",
  "slug": "mushroom-risotto",
  "version": 3,
  "recipe_json": { ... full JOAv0 ... },
  "metadata": { ... },
  "status": "published",
  "quality_score": 85,
  "created_at": "...",
  "updated_at": "...",
  "versions": [...]  // if include_versions=true
}
```

#### Create Recipe
```
POST /api/v2/recipes
Body:
{
  "slug": "new-recipe-name",
  "recipe_json": { ... JOAv0 ... },
  "status": "draft",  // optional
  "source_url": "..."  // optional
}

Response: Created recipe object
```

#### Update Recipe
```
PUT /api/v2/recipes/{slug}
Body:
{
  "recipe_json": { ... },
  "change_summary": "Updated step 3 instructions"
}

Response: Updated recipe object (version incremented)
```

#### Publish Recipe
```
POST /api/v2/recipes/{slug}/publish

Response: Published recipe object
```

### 4.2 Backend-Voice Recipe Access

The backend-voice service will fetch recipes directly from Supabase:

```python
# services/recipe_service.py (NEW)

from supabase import create_client

class RecipeService:
    def __init__(self):
        self.client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        )
    
    async def get_recipe(self, recipe_id: str) -> dict | None:
        """Fetch recipe from Supabase by ID or slug."""
        response = self.client.table("recipes") \
            .select("*") \
            .or_(f"id.eq.{recipe_id},slug.eq.{recipe_id}") \
            .eq("status", "published") \
            .single() \
            .execute()
        
        if response.data:
            return response.data["recipe_json"]
        return None
    
    async def get_recipe_by_slug(self, slug: str) -> dict | None:
        """Fetch recipe by URL-friendly slug."""
        response = self.client.table("recipes") \
            .select("recipe_json") \
            .eq("slug", slug) \
            .eq("status", "published") \
            .single() \
            .execute()
        
        if response.data:
            return response.data["recipe_json"]
        return None
```

---

## 5. Recipe Enhancement Pipeline

### 5.1 Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Recipe Enhancement Pipeline                          │
│                                                                          │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌────────┐│
│  │  Source  │──▶│ Crawler  │──▶│   LLM    │──▶│ Validator│──▶│Uploader││
│  │  URLs    │   │          │   │Structurer│   │          │   │        ││
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └────────┘│
│                                                                          │
│  Input:          Raw HTML      Structured     Validated      Stored in  │
│  Recipe URLs     + Text        JOAv0 JSON     + Scored       Supabase   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Web Crawler Component

```python
# recipe_pipeline/crawler.py

import httpx
from bs4 import BeautifulSoup
from dataclasses import dataclass

@dataclass
class RawRecipe:
    url: str
    title: str
    description: str
    ingredients: list[str]
    instructions: list[str]
    prep_time: str | None
    cook_time: str | None
    servings: str | None
    image_url: str | None
    raw_html: str

class JamieOliverCrawler:
    BASE_URL = "https://www.jamieoliver.com"
    
    async def crawl_recipe(self, url: str) -> RawRecipe:
        """Extract recipe data from Jamie Oliver website."""
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            response.raise_for_status()
        
        soup = BeautifulSoup(response.text, "html.parser")
        
        # Extract recipe data using site-specific selectors
        return RawRecipe(
            url=url,
            title=self._extract_title(soup),
            description=self._extract_description(soup),
            ingredients=self._extract_ingredients(soup),
            instructions=self._extract_instructions(soup),
            prep_time=self._extract_time(soup, "prep"),
            cook_time=self._extract_time(soup, "cook"),
            servings=self._extract_servings(soup),
            image_url=self._extract_image(soup),
            raw_html=response.text,
        )
    
    async def discover_recipe_urls(self, category: str = None) -> list[str]:
        """Discover recipe URLs from the website."""
        # Implementation for crawling recipe listings
        pass
```

### 5.3 LLM Structurer Component

This component uses the existing `llama_structurer.py` logic with enhancements:

```python
# recipe_pipeline/structurer.py

from openai import AsyncOpenAI

class RecipeStructurer:
    """Convert raw recipe data to JOAv0 format using LLM."""
    
    SYSTEM_PROMPT = """You are a recipe structuring assistant for Jamie Oliver AI.
    
Convert the raw recipe data into our JOAv0 JSON format. Follow these rules:

1. STEP IDs: Use semantic, descriptive IDs like "preheat_oven", "sear_chicken", "rest_meat"
   NOT generic IDs like "step_1", "step_2"

2. STEP TYPES:
   - "timer": For steps requiring waiting (e.g., "bake for 20 minutes")
   - "immediate": For active cooking steps
   
3. TIMERS: For timer steps, include:
   - duration: number in seconds
   - auto_start: true if timer should start automatically
   
4. ON_ENTER.SAY: Write warm, encouraging instructions as if Jamie Oliver is speaking:
   - GOOD: "Right, let's get this beautiful risotto started! First, heat up your pan..."
   - BAD: "Heat pan."

5. REQUIRES_CONFIRM: Set to true for steps where user should confirm completion

6. INGREDIENTS: Include all ingredients with:
   - name, amount, unit, notes (optional), required (boolean)

7. UTENSILS: List all required utensils

Output valid JSON only, no markdown or explanation."""

    async def structure_recipe(self, raw: RawRecipe) -> dict:
        """Convert raw recipe to JOAv0 format."""
        client = AsyncOpenAI()
        
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": self.SYSTEM_PROMPT},
                {"role": "user", "content": self._format_input(raw)},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        
        return json.loads(response.choices[0].message.content)
    
    def _format_input(self, raw: RawRecipe) -> str:
        return f"""
Title: {raw.title}
Description: {raw.description}
Prep Time: {raw.prep_time}
Cook Time: {raw.cook_time}
Servings: {raw.servings}

INGREDIENTS:
{chr(10).join(f"- {i}" for i in raw.ingredients)}

INSTRUCTIONS:
{chr(10).join(f"{i+1}. {step}" for i, step in enumerate(raw.instructions))}
"""
```

### 5.4 Quality Validator Component

```python
# recipe_pipeline/validator.py

from dataclasses import dataclass
from typing import List

@dataclass
class ValidationResult:
    is_valid: bool
    quality_score: int  # 0-100
    errors: List[str]
    warnings: List[str]

class RecipeValidator:
    """Validate recipe quality and structure."""
    
    def validate(self, recipe_json: dict) -> ValidationResult:
        errors = []
        warnings = []
        score = 100
        
        recipe = recipe_json.get("recipe", {})
        steps = recipe_json.get("steps", [])
        ingredients = recipe_json.get("ingredients", [])
        
        # Required fields
        if not recipe.get("title"):
            errors.append("Missing recipe title")
            score -= 20
        
        if not recipe.get("id"):
            errors.append("Missing recipe ID")
            score -= 10
        
        # Steps validation
        if not steps:
            errors.append("No steps defined")
            score -= 30
        else:
            # Check for semantic step IDs
            generic_ids = sum(1 for s in steps if s.get("step_id", "").startswith("step_"))
            if generic_ids > 0:
                warnings.append(f"{generic_ids} steps have generic IDs (step_1, step_2...)")
                score -= generic_ids * 2
            
            # Check for on_enter.say
            missing_say = sum(1 for s in steps if not s.get("on_enter", {}).get("say"))
            if missing_say > 0:
                warnings.append(f"{missing_say} steps missing on_enter.say")
                score -= missing_say * 3
            
            # Check for timer steps
            timer_steps = [s for s in steps if s.get("type") == "timer"]
            timer_keywords = ["minute", "hour", "second", "wait", "bake", "simmer", "rest"]
            potential_timers = sum(
                1 for s in steps 
                if any(kw in s.get("on_enter", {}).get("say", "").lower() for kw in timer_keywords)
                and s.get("type") != "timer"
            )
            if potential_timers > 0:
                warnings.append(f"{potential_timers} steps might need timer type")
                score -= potential_timers * 2
            
            # Check for requires_confirm
            no_confirm = sum(1 for s in steps if not s.get("requires_confirm", False))
            if no_confirm == len(steps):
                warnings.append("No steps require confirmation - agent won't wait for user")
                score -= 10
        
        # Ingredients validation
        if not ingredients:
            warnings.append("No ingredients listed")
            score -= 15
        
        # Utensils validation
        if not recipe_json.get("utensils"):
            warnings.append("No utensils listed")
            score -= 5
        
        return ValidationResult(
            is_valid=len(errors) == 0,
            quality_score=max(0, score),
            errors=errors,
            warnings=warnings,
        )
```

### 5.5 Supabase Uploader Component

```python
# recipe_pipeline/uploader.py

class RecipeUploader:
    """Upload validated recipes to Supabase."""
    
    def __init__(self):
        self.client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        )
    
    async def upload(
        self,
        slug: str,
        recipe_json: dict,
        validation: ValidationResult,
        source_url: str = None,
        publish: bool = False,
    ) -> dict:
        """Upload recipe to Supabase."""
        
        # Compute metadata
        metadata = self._compute_metadata(recipe_json, validation)
        
        # Check if exists
        existing = self.client.table("recipes") \
            .select("id, version") \
            .eq("slug", slug) \
            .single() \
            .execute()
        
        if existing.data:
            # Update existing recipe
            new_version = existing.data["version"] + 1
            
            # Save version history
            self.client.table("recipe_versions").insert({
                "recipe_id": existing.data["id"],
                "version": existing.data["version"],
                "recipe_json": recipe_json,
                "metadata": metadata,
                "change_summary": "Updated via pipeline",
            }).execute()
            
            # Update recipe
            result = self.client.table("recipes") \
                .update({
                    "recipe_json": recipe_json,
                    "metadata": metadata,
                    "version": new_version,
                    "quality_score": validation.quality_score,
                    "status": "published" if publish else "draft",
                    "published_at": "now()" if publish else None,
                }) \
                .eq("slug", slug) \
                .execute()
        else:
            # Insert new recipe
            result = self.client.table("recipes").insert({
                "slug": slug,
                "recipe_json": recipe_json,
                "metadata": metadata,
                "quality_score": validation.quality_score,
                "source_url": source_url,
                "source_type": "scraped" if source_url else "manual",
                "status": "published" if publish else "draft",
                "published_at": "now()" if publish else None,
            }).execute()
        
        # Sync search index
        await self._sync_search_index(result.data[0])
        
        return result.data[0]
    
    def _compute_metadata(self, recipe_json: dict, validation: ValidationResult) -> dict:
        recipe = recipe_json.get("recipe", {})
        steps = recipe_json.get("steps", [])
        ingredients = recipe_json.get("ingredients", [])
        
        return {
            "title": recipe.get("title"),
            "total_time_minutes": self._parse_time(recipe.get("total_time")),
            "servings": recipe.get("servings"),
            "difficulty": recipe.get("difficulty"),
            "step_count": len(steps),
            "has_timers": any(s.get("type") == "timer" for s in steps),
            "timer_count": sum(1 for s in steps if s.get("type") == "timer"),
            "ingredient_count": len(ingredients),
            "categories": recipe.get("categories", []),
            "moods": recipe.get("moods", []),
            "image_url": recipe.get("image_url"),
            "quality_indicators": {
                "has_on_enter_say": all(s.get("on_enter", {}).get("say") for s in steps),
                "has_semantic_step_ids": not any(s.get("step_id", "").startswith("step_") for s in steps),
                "has_timer_steps": any(s.get("type") == "timer" for s in steps),
                "has_detailed_instructions": True,  # Could add word count check
            },
        }
```

---

## 6. Implementation Plan

### Phase 1: Database & API Foundation (1 week)

| Issue ID | Title | Description | Priority |
|----------|-------|-------------|----------|
| RDP-01 | Create `recipes` table in Supabase | Implement the recipes table schema with all required columns, indexes, and triggers | P0 |
| RDP-02 | Create `recipe_versions` table | Implement version history table with foreign key to recipes | P0 |
| RDP-03 | Implement Recipe API v2 CRUD endpoints | Create/Read/Update endpoints in backend-search | P0 |
| RDP-04 | Migrate existing recipes to Supabase | Script to load all `/data/recipes/*.json` into recipes table | P0 |

### Phase 2: Service Integration (1 week)

| Issue ID | Title | Description | Priority |
|----------|-------|-------------|----------|
| RDP-05 | Backend-voice: Implement RecipeService | Create service to fetch recipes directly from Supabase | P0 |
| RDP-06 | Backend-voice: Remove frontend payload dependency | Update start_recipe to fetch from Supabase if not in payload | P1 |
| RDP-07 | Frontend: Fetch recipes from API | Replace local JSON loading with API calls | P1 |
| RDP-08 | Frontend: Remove /public/recipes folder | Clean up deprecated local recipe files | P2 |

### Phase 3: Recipe Enhancement Pipeline (2 weeks)

| Issue ID | Title | Description | Priority |
|----------|-------|-------------|----------|
| RDP-09 | Implement Web Crawler for Jamie Oliver | Create crawler component with rate limiting and error handling | P1 |
| RDP-10 | Implement LLM Structurer (JOAv0) | Create component to convert raw recipes to JOAv0 format | P1 |
| RDP-11 | Implement Quality Validator | Create validation and scoring component | P1 |
| RDP-12 | Implement Supabase Uploader | Create component to upload recipes with versioning | P1 |
| RDP-13 | Create CLI tool for pipeline | `python -m recipe_pipeline crawl <url>` | P2 |

### Phase 4: Quality Improvements (1 week)

| Issue ID | Title | Description | Priority |
|----------|-------|-------------|----------|
| RDP-14 | Enhance existing recipes with LLM | Run pipeline on existing recipes to add on_enter.say, timers, etc. | P1 |
| RDP-15 | Add quality dashboard | Simple UI to view recipe quality scores and issues | P2 |
| RDP-16 | Implement frontend step-complete notification | Send event to backend when user marks step as complete | P0 |

---

## 7. Migration Strategy

### Step 1: Deploy Database Schema

```bash
# Run in Supabase SQL editor
# 1. Create recipes table
# 2. Create recipe_versions table
# 3. Add foreign keys to existing tables
```

### Step 2: Migrate Existing Recipes

```bash
cd apps/backend-search
python -m recipe_pipeline.migrate_local_recipes \
  --source-dir ../../data/recipes \
  --publish \
  --enhance  # Optional: run through LLM enhancement
```

### Step 3: Update Services

1. Deploy backend-search with v2 API
2. Update backend-voice environment:
   ```
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   RECIPE_SOURCE=supabase  # NEW: use 'local' for fallback
   ```
3. Update frontend to use API
4. Remove deprecated local files

### Step 4: Verify

```bash
# Health check
curl http://localhost:8000/api/v2/recipes | jq '.items | length'

# Check quality scores
curl http://localhost:8000/api/v2/recipes?min_quality=80 | jq '.items | length'
```

---

## 8. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Recipes in Supabase | 50+ | COUNT(*) FROM recipes WHERE status='published' |
| Average Quality Score | ≥80 | AVG(quality_score) FROM recipes |
| Recipe Fetch Latency | <200ms | p95 from backend-voice logs |
| Agent Context Accuracy | 100% | Agent always has correct recipe context |
| Zero Local File Dependencies | 0 files | `/public/recipes/` and `/data/recipes/` removed from production |

---

## 9. Appendix

### A. JOAv0 Schema Reference

```json
{
  "recipe": {
    "id": "mushroom-risotto",
    "title": "Mushroom Risotto",
    "description": "A creamy, comforting Italian classic...",
    "servings": 4,
    "difficulty": "medium",
    "prep_time": "PT15M",
    "cook_time": "PT30M",
    "total_time": "PT45M",
    "image_url": "...",
    "categories": ["dinner", "italian"],
    "moods": ["comfort", "impressive"]
  },
  "ingredients": [
    {
      "name": "arborio rice",
      "amount": "300",
      "unit": "g",
      "required": true
    }
  ],
  "utensils": [
    "large pan",
    "wooden spoon"
  ],
  "steps": [
    {
      "step_id": "heat_stock",
      "type": "immediate",
      "on_enter": {
        "say": "Right, first things first - let's get that stock warming up..."
      },
      "requires_confirm": true
    },
    {
      "step_id": "simmer_rice",
      "type": "timer",
      "duration": 1200,
      "auto_start": true,
      "on_enter": {
        "say": "Now we're cooking! This needs about 20 minutes of love..."
      },
      "requires_confirm": true
    }
  ]
}
```

### B. Environment Variables

```bash
# backend-search
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# backend-voice
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
RECIPE_SOURCE=supabase  # or 'local' for fallback

# Frontend
VITE_API_BASE_URL=http://localhost:8000
```

---

## 10. Review Checklist

- [ ] Database schema reviewed by team
- [ ] API contract reviewed by frontend team
- [ ] Migration plan tested in staging
- [ ] Rollback procedure documented
- [ ] Performance benchmarks established
- [ ] Security review (Supabase RLS policies)
