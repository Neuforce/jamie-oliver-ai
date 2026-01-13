# Recipe Data Platform - Linear Issues

> **Note**: Linear issue creation limit was reached. Use these templates to create issues manually.
> **Epic**: Recipe Data Platform - Supabase as Single Source of Truth
> **Project**: Supertab - JamieOliverAI

---

## Phase 1: Database & API Foundation

### RDP-01: Create `recipes` table in Supabase

**Type**: Task  
**Priority**: P0 (Urgent)  
**Labels**: Backend, Database  
**Estimate**: 2 points

#### Description

Create the main `recipes` table in Supabase that will serve as the single source of truth for all recipe data.

#### Technical Details

- Table name: `recipes`
- Primary key: UUID
- Unique constraint: `slug`
- JSONB columns: `recipe_json`, `metadata`
- Status enum: draft, published, archived
- Include all indexes and triggers

#### Acceptance Criteria

- [ ] `recipes` table created with all columns per schema
- [ ] All indexes created (slug, status, quality_score, metadata GIN)
- [ ] Auto-update trigger for `updated_at`
- [ ] RLS policies configured (service role full access, anon read published only)
- [ ] Schema documented in `db/` folder

#### SQL Reference

See `docs/architecture/RECIPE_DATA_PLATFORM.md` Section 3.1

---

### RDP-02: Create `recipe_versions` table

**Type**: Task  
**Priority**: P0 (Urgent)  
**Labels**: Backend, Database  
**Estimate**: 1 point

#### Description

Create the version history table for tracking recipe changes over time.

#### Technical Details

- Table name: `recipe_versions`
- Foreign key to `recipes(id)` with CASCADE delete
- Unique constraint: `(recipe_id, version)`

#### Acceptance Criteria

- [ ] `recipe_versions` table created
- [ ] Foreign key constraint working
- [ ] Indexes on `recipe_id` and `created_at`
- [ ] Test inserting version history

---

### RDP-03: Implement Recipe API v2 CRUD endpoints

**Type**: Feature  
**Priority**: P0 (Urgent)  
**Labels**: Backend, API  
**Estimate**: 5 points

#### Description

Create REST API endpoints for recipe CRUD operations in `backend-search`.

#### Endpoints

```
GET    /api/v2/recipes          - List recipes with filters
GET    /api/v2/recipes/{slug}   - Get single recipe
POST   /api/v2/recipes          - Create recipe
PUT    /api/v2/recipes/{slug}   - Update recipe
POST   /api/v2/recipes/{slug}/publish - Publish recipe
DELETE /api/v2/recipes/{slug}   - Archive recipe
```

#### Acceptance Criteria

- [ ] All endpoints implemented and documented
- [ ] Pagination working (limit, offset)
- [ ] Filtering by status, category, mood, quality_score
- [ ] Version auto-increment on update
- [ ] Version history saved on update
- [ ] OpenAPI schema generated
- [ ] Unit tests for each endpoint

---

### RDP-04: Migrate existing recipes to Supabase

**Type**: Task  
**Priority**: P0 (Urgent)  
**Labels**: Backend, Migration  
**Estimate**: 3 points

#### Description

Create a migration script to load all existing recipes from `/data/recipes/*.json` into the new `recipes` table.

#### Acceptance Criteria

- [ ] Script reads all JSON files from `/data/recipes/`
- [ ] Validates each recipe against JOAv0 schema
- [ ] Computes metadata from recipe_json
- [ ] Calculates quality_score using validator
- [ ] Upserts to `recipes` table (idempotent)
- [ ] Logs validation warnings
- [ ] CLI: `python -m recipe_pipeline migrate --source-dir ../../data/recipes`

---

## Phase 2: Service Integration

### RDP-05: Backend-voice: Implement RecipeService

**Type**: Feature  
**Priority**: P0 (Urgent)  
**Labels**: Backend  
**Estimate**: 3 points

#### Description

Create a `RecipeService` in backend-voice to fetch recipes directly from Supabase.

#### File Location

`apps/backend-voice/src/services/recipe_service.py`

#### Acceptance Criteria

- [ ] `RecipeService` class with Supabase client
- [ ] `get_recipe(recipe_id)` method - fetch by ID or slug
- [ ] `get_recipe_by_slug(slug)` method
- [ ] Caching layer (optional, in-memory with TTL)
- [ ] Error handling for not found / connection errors
- [ ] Unit tests

---

### RDP-06: Backend-voice: Use RecipeService in recipe tools

**Type**: Feature  
**Priority**: P1 (High)  
**Labels**: Backend  
**Estimate**: 3 points

#### Description

Update `start_recipe` tool to fetch recipe from Supabase if not provided in frontend payload.

#### Current Behavior

```python
# tools/recipe_tools.py
async def start_recipe_tool(..., recipe_payload: dict, ...):
    # Relies entirely on frontend-provided payload
```

#### Target Behavior

```python
async def start_recipe_tool(..., recipe_id: str, recipe_payload: dict = None, ...):
    if not recipe_payload:
        recipe_payload = await recipe_service.get_recipe(recipe_id)
    # Continue with recipe_payload
```

#### Acceptance Criteria

- [ ] `start_recipe` fetches from Supabase if payload missing
- [ ] Fallback to frontend payload if provided (for backward compatibility)
- [ ] Logs whether recipe came from Supabase or frontend
- [ ] Error message if recipe not found in either source
- [ ] Integration test with real Supabase

---

### RDP-07: Frontend: Fetch recipes from API

**Type**: Feature  
**Priority**: P1 (High)  
**Labels**: Frontend  
**Estimate**: 5 points

#### Description

Replace local JSON file loading with API calls to backend-search.

#### Files to Modify

- `apps/frontend/src/data/recipeLoader.ts`
- `apps/frontend/src/data/recipes.ts`
- `apps/frontend/src/hooks/useRecipes.ts` (may need new hook)

#### Acceptance Criteria

- [ ] Create `useRecipes` hook for fetching recipe list
- [ ] Create `useRecipe(slug)` hook for single recipe
- [ ] Loading states in UI
- [ ] Error states in UI
- [ ] Cache with React Query or SWR
- [ ] Environment variable for API base URL
- [ ] Remove imports from local JSON files

---

### RDP-08: Frontend: Remove /public/recipes folder

**Type**: Chore  
**Priority**: P2 (Medium)  
**Labels**: Frontend, Cleanup  
**Estimate**: 1 point

#### Description

After API integration is complete, remove the deprecated local recipe files.

#### Acceptance Criteria

- [ ] Delete `/apps/frontend/public/recipes/` folder
- [ ] Remove any remaining imports/references
- [ ] Verify app works without local files
- [ ] Update documentation

---

## Phase 3: Recipe Enhancement Pipeline

### RDP-09: Implement Web Crawler for Jamie Oliver

**Type**: Feature  
**Priority**: P1 (High)  
**Labels**: Backend, Pipeline  
**Estimate**: 5 points

#### Description

Create a web crawler to extract recipe data from Jamie Oliver's website.

#### File Location

`apps/backend-search/recipe_pipeline/crawler.py`

#### Features

- Rate limiting (respect robots.txt)
- Error handling and retries
- Extract: title, description, ingredients, instructions, times, image
- Recipe URL discovery from category pages

#### Acceptance Criteria

- [ ] `JamieOliverCrawler` class implemented
- [ ] `crawl_recipe(url)` returns `RawRecipe` dataclass
- [ ] `discover_recipe_urls(category)` returns list of URLs
- [ ] Rate limiting: max 1 request/second
- [ ] Retry logic with exponential backoff
- [ ] Unit tests with mocked responses

---

### RDP-10: Implement LLM Structurer (JOAv0)

**Type**: Feature  
**Priority**: P1 (High)  
**Labels**: Backend, Pipeline, AI  
**Estimate**: 5 points

#### Description

Create a component that uses GPT-4 to convert raw recipe data into proper JOAv0 format.

#### File Location

`apps/backend-search/recipe_pipeline/structurer.py`

#### Key Enhancements

- Generate semantic step IDs (not step_1, step_2)
- Add warm, Jamie-style `on_enter.say` messages
- Detect and create timer steps with durations
- Set `requires_confirm` appropriately
- Normalize ingredients and utensils

#### Acceptance Criteria

- [ ] `RecipeStructurer` class implemented
- [ ] System prompt produces high-quality JOAv0
- [ ] Semantic step IDs (e.g., "sear_chicken", "rest_meat")
- [ ] Timer steps with duration in seconds
- [ ] Warm, conversational `on_enter.say` messages
- [ ] All required JOAv0 fields present
- [ ] Unit tests with sample recipes

---

### RDP-11: Implement Quality Validator

**Type**: Feature  
**Priority**: P1 (High)  
**Labels**: Backend, Pipeline  
**Estimate**: 3 points

#### Description

Create a validation component that checks recipe quality and produces a score.

#### File Location

`apps/backend-search/recipe_pipeline/validator.py`

#### Quality Checks

- Required fields present
- Semantic step IDs (not generic)
- `on_enter.say` for all steps
- Timer steps where appropriate
- `requires_confirm` flags
- Ingredients and utensils present

#### Acceptance Criteria

- [ ] `RecipeValidator` class implemented
- [ ] `validate(recipe_json)` returns `ValidationResult`
- [ ] Quality score 0-100
- [ ] List of errors (blocking issues)
- [ ] List of warnings (quality issues)
- [ ] Unit tests with good/bad recipes

---

### RDP-12: Implement Supabase Uploader

**Type**: Feature  
**Priority**: P1 (High)  
**Labels**: Backend, Pipeline  
**Estimate**: 3 points

#### Description

Create a component to upload validated recipes to Supabase with versioning.

#### File Location

`apps/backend-search/recipe_pipeline/uploader.py`

#### Features

- Upsert logic (insert or update)
- Version increment on update
- Version history saving
- Metadata computation
- Search index sync

#### Acceptance Criteria

- [ ] `RecipeUploader` class implemented
- [ ] `upload()` creates or updates recipe
- [ ] Version incremented on update
- [ ] Previous version saved to `recipe_versions`
- [ ] Metadata computed from recipe_json
- [ ] Integration test with Supabase

---

### RDP-13: Create CLI tool for pipeline

**Type**: Feature  
**Priority**: P2 (Medium)  
**Labels**: Backend, Pipeline, DX  
**Estimate**: 2 points

#### Description

Create a command-line interface for running the recipe enhancement pipeline.

#### Commands

```bash
# Crawl single recipe
python -m recipe_pipeline crawl https://www.jamieoliver.com/recipes/...

# Crawl category
python -m recipe_pipeline discover --category=pasta --limit=10

# Enhance existing recipe
python -m recipe_pipeline enhance mushroom-risotto

# Validate recipe
python -m recipe_pipeline validate path/to/recipe.json

# Full pipeline
python -m recipe_pipeline run --url=... --publish
```

#### Acceptance Criteria

- [ ] CLI with click or argparse
- [ ] All commands working
- [ ] Progress output
- [ ] Error handling and logging
- [ ] Help documentation

---

## Phase 4: Quality Improvements

### RDP-14: Enhance existing recipes with LLM

**Type**: Task  
**Priority**: P1 (High)  
**Labels**: Backend, AI  
**Estimate**: 5 points

#### Description

Run the enhancement pipeline on all existing recipes to improve their quality.

#### Target Improvements

- Add/improve `on_enter.say` messages
- Convert generic step IDs to semantic IDs
- Add timer steps where appropriate
- Set `requires_confirm` flags
- Improve ingredient normalization

#### Acceptance Criteria

- [ ] Script to enhance all recipes in batch
- [ ] Before/after quality score comparison
- [ ] Manual review of sample enhanced recipes
- [ ] All recipes have quality_score >= 80
- [ ] No regressions in working recipes

---

### RDP-15: Add quality dashboard

**Type**: Feature  
**Priority**: P2 (Medium)  
**Labels**: Frontend, Admin  
**Estimate**: 3 points

#### Description

Create a simple admin UI to view recipe quality scores and validation issues.

#### Features

- Recipe list with quality scores
- Sort by quality score
- View validation errors/warnings
- Quick link to edit recipe
- Bulk actions (enhance, publish)

#### Acceptance Criteria

- [ ] Dashboard page at `/admin/recipes`
- [ ] Table with all recipes and quality scores
- [ ] Filter by status, quality threshold
- [ ] Expand row to see validation details
- [ ] Actions: enhance, publish, archive

---

### RDP-16: Frontend step-complete notification to backend

**Type**: Feature  
**Priority**: P0 (Urgent)  
**Labels**: Frontend, Backend, Integration  
**Estimate**: 3 points

#### Description

When user marks a step as complete in the UI, send a notification to the backend agent.

#### Current Behavior

```typescript
// CookWithJamie.tsx
const toggleStepComplete = () => {
  // Only updates local state - backend never knows!
  setCompletedSteps([...completedSteps, currentStep]);
};
```

#### Target Behavior

```typescript
const toggleStepComplete = () => {
  setCompletedSteps([...completedSteps, currentStep]);
  // Send to backend via WebSocket
  sendMessage({
    type: 'control',
    action: 'step_completed',
    data: { stepIndex: currentStep, stepId: currentStepId }
  });
};
```

#### Backend Handler

```python
# Handle step_completed event
# Update recipe engine state
# Agent can acknowledge or proceed
```

#### Acceptance Criteria

- [ ] Frontend sends `step_completed` event via WebSocket
- [ ] Backend receives and processes event
- [ ] Recipe engine state updated
- [ ] Agent acknowledges completion (optional voice response)
- [ ] Handle un-marking step as complete
- [ ] Integration test

---

## Priority Summary

| Priority | Issues | Total Points |
|----------|--------|--------------|
| P0 | RDP-01, RDP-02, RDP-03, RDP-04, RDP-05, RDP-16 | 17 |
| P1 | RDP-06, RDP-07, RDP-09, RDP-10, RDP-11, RDP-12, RDP-14 | 27 |
| P2 | RDP-08, RDP-13, RDP-15 | 6 |
| **Total** | **16 issues** | **50 points** |

---

## Suggested Sprint Plan

### Sprint 1 (Week 1): Foundation
- RDP-01: Create recipes table
- RDP-02: Create recipe_versions table
- RDP-03: Recipe API v2 endpoints
- RDP-04: Migrate existing recipes
- RDP-05: Backend-voice RecipeService

### Sprint 2 (Week 2): Integration
- RDP-06: Backend-voice use RecipeService
- RDP-07: Frontend fetch from API
- RDP-16: Step-complete notification
- RDP-08: Remove local files

### Sprint 3 (Week 3-4): Pipeline
- RDP-09: Web Crawler
- RDP-10: LLM Structurer
- RDP-11: Quality Validator
- RDP-12: Supabase Uploader
- RDP-13: CLI tool

### Sprint 4 (Week 4): Enhancement
- RDP-14: Enhance existing recipes
- RDP-15: Quality dashboard
