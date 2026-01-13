# Recipe Data Platform - Change Management & Rollout Plan

> **Document Status**: Change Management Plan  
> **Created**: 2026-01-12  
> **Goal**: Zero-downtime migration with backward compatibility

---

## 1. Core Principles

### 1.1 Backward Compatibility First

Every change MUST maintain backward compatibility until fully migrated:

| Principle | Implementation |
|-----------|----------------|
| **Dual-source support** | Services read from both old and new sources |
| **Feature flags** | All new behavior behind flags |
| **Gradual rollout** | % rollout with instant rollback |
| **No big bang** | Incremental changes, not one massive PR |

### 1.2 Safe Deployment Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT SAFETY LADDER                      │
├─────────────────────────────────────────────────────────────────┤
│  Level 1: Feature flag OFF (use old behavior)                   │
│  Level 2: Feature flag ON for developers only                   │
│  Level 3: Feature flag ON for 10% of traffic                    │
│  Level 4: Feature flag ON for 50% of traffic                    │
│  Level 5: Feature flag ON for 100% (new behavior default)       │
│  Level 6: Remove old code paths (cleanup)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Branch Strategy

### 2.1 Long-Running Feature Branch

```
main
  │
  └── feature/recipe-data-platform (long-running, protected)
        │
        ├── rdp/01-database-schema
        ├── rdp/02-api-v2-endpoints
        ├── rdp/03-backend-voice-service
        ├── rdp/04-frontend-api-integration
        └── ... (each issue gets its own branch)
```

### 2.2 Branch Naming Convention

```
rdp/XX-short-description

Examples:
  rdp/01-database-schema
  rdp/02-api-v2-list-endpoint
  rdp/03-api-v2-get-endpoint
  rdp/04-recipe-service-backend-voice
  rdp/05-feature-flag-setup
```

### 2.3 PR Flow

```
1. Create branch from feature/recipe-data-platform
2. Implement small, focused change
3. PR to feature/recipe-data-platform (NOT main)
4. Code review by at least 1 team member
5. Merge to feature branch
6. Weekly sync: merge main → feature/recipe-data-platform
7. Final: PR feature/recipe-data-platform → main (after full testing)
```

### 2.4 Avoiding Merge Conflicts

| Strategy | How |
|----------|-----|
| **Small PRs** | Max 200-300 lines changed per PR |
| **New files preferred** | Add new services/endpoints instead of modifying existing |
| **Weekly syncs** | Merge main into feature branch every week |
| **Interface-first** | Define types/interfaces before implementation |
| **Feature flags** | New code coexists with old, no deletions until cleanup phase |

---

## 3. Feature Flags Implementation

### 3.1 Backend Feature Flags

Create a simple feature flag system:

```python
# apps/backend-voice/src/config/feature_flags.py

import os
from enum import Enum

class FeatureFlag(str, Enum):
    RECIPE_SOURCE_SUPABASE = "RECIPE_SOURCE_SUPABASE"
    STEP_COMPLETE_EVENTS = "STEP_COMPLETE_EVENTS"
    RECIPE_API_V2 = "RECIPE_API_V2"

def is_enabled(flag: FeatureFlag, default: bool = False) -> bool:
    """Check if a feature flag is enabled."""
    env_value = os.getenv(f"FF_{flag.value}", str(default).lower())
    return env_value.lower() in ("true", "1", "yes", "on")

# Usage example:
# if is_enabled(FeatureFlag.RECIPE_SOURCE_SUPABASE):
#     recipe = await recipe_service.get_recipe(recipe_id)
# else:
#     recipe = recipe_payload  # old behavior
```

### 3.2 Environment Variables

```bash
# .env.example - Add these with defaults OFF
FF_RECIPE_SOURCE_SUPABASE=false    # Use Supabase for recipes
FF_STEP_COMPLETE_EVENTS=false      # Enable step completion events
FF_RECIPE_API_V2=false             # Enable v2 API endpoints
```

### 3.3 Frontend Feature Flags

```typescript
// apps/frontend/src/config/featureFlags.ts

export const FeatureFlags = {
  RECIPE_API_V2: import.meta.env.VITE_FF_RECIPE_API_V2 === 'true',
  STEP_COMPLETE_EVENTS: import.meta.env.VITE_FF_STEP_COMPLETE_EVENTS === 'true',
} as const;

// Usage:
// if (FeatureFlags.RECIPE_API_V2) {
//   recipe = await fetchRecipeFromAPI(slug);
// } else {
//   recipe = await loadLocalRecipe(slug);
// }
```

---

## 4. Backward-Compatible Implementation

### 4.1 Recipe Service (Backend-Voice)

```python
# apps/backend-voice/src/services/recipe_service.py

class RecipeService:
    """
    Recipe fetching with backward compatibility.
    
    Priority order:
    1. If payload provided by frontend, use it (current behavior)
    2. If RECIPE_SOURCE_SUPABASE enabled, fetch from Supabase
    3. Fall back to local files (if RECIPES_SOURCE=local)
    """
    
    async def get_recipe(
        self,
        recipe_id: str,
        frontend_payload: dict | None = None,
    ) -> dict | None:
        # Priority 1: Frontend payload (backward compatible)
        if frontend_payload:
            logger.info(f"Using frontend-provided recipe payload for {recipe_id}")
            return frontend_payload
        
        # Priority 2: Supabase (new behavior, behind flag)
        if is_enabled(FeatureFlag.RECIPE_SOURCE_SUPABASE):
            logger.info(f"Fetching recipe {recipe_id} from Supabase")
            recipe = await self._fetch_from_supabase(recipe_id)
            if recipe:
                return recipe
            logger.warning(f"Recipe {recipe_id} not found in Supabase, falling back")
        
        # Priority 3: Local files (fallback)
        logger.info(f"Loading recipe {recipe_id} from local files")
        return await self._load_from_local(recipe_id)
```

### 4.2 Recipe API (Backend-Search)

```python
# apps/backend-search/recipe_search_agent/api.py

# KEEP existing v1 endpoints unchanged
@app.get("/api/v1/recipes/{recipe_id}")
async def get_recipe_v1(recipe_id: str):
    """EXISTING - Do not modify. Loads from file_path."""
    # ... existing implementation ...

# ADD new v2 endpoints alongside v1
@app.get("/api/v2/recipes/{slug}")
async def get_recipe_v2(slug: str):
    """NEW - Reads from Supabase recipes table."""
    if not is_enabled(FeatureFlag.RECIPE_API_V2):
        raise HTTPException(503, "API v2 not enabled")
    
    # ... new implementation ...
```

### 4.3 Frontend Recipe Loading

```typescript
// apps/frontend/src/data/recipeLoader.ts

export async function loadRecipe(slug: string): Promise<Recipe> {
  // New behavior: API fetch (behind flag)
  if (FeatureFlags.RECIPE_API_V2) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/recipes/${slug}`);
      if (response.ok) {
        return await response.json();
      }
      console.warn(`API fetch failed for ${slug}, falling back to local`);
    } catch (error) {
      console.warn(`API error for ${slug}, falling back to local`, error);
    }
  }
  
  // Fallback: Local JSON (existing behavior)
  return loadLocalRecipe(slug);
}

// KEEP existing function unchanged
async function loadLocalRecipe(slug: string): Promise<Recipe> {
  // ... existing implementation from /public/recipes/ ...
}
```

---

## 5. Database Migration Strategy

### 5.1 Non-Breaking Schema Changes

The new tables (`recipes`, `recipe_versions`) are **additive** - they don't modify existing tables.

```sql
-- Phase 1: Add new tables (no impact on existing)
CREATE TABLE IF NOT EXISTS recipes (...);
CREATE TABLE IF NOT EXISTS recipe_versions (...);

-- Phase 2: Add optional foreign keys to existing tables
-- These are nullable and don't affect existing queries
ALTER TABLE recipe_index ADD COLUMN IF NOT EXISTS recipe_uuid UUID;
ALTER TABLE intelligent_recipe_chunks ADD COLUMN IF NOT EXISTS recipe_uuid UUID;

-- Phase 3 (after migration): Add constraints (optional)
-- Only do this after all data is migrated
-- ALTER TABLE recipe_index ADD CONSTRAINT fk_recipe 
--   FOREIGN KEY (recipe_uuid) REFERENCES recipes(id);
```

### 5.2 Data Migration (Offline, Safe)

```bash
# Migration script runs ONCE to populate new table
# Does NOT delete or modify existing data

python -m recipe_pipeline migrate \
  --source-dir ../../data/recipes \
  --dry-run  # First run with dry-run to verify

python -m recipe_pipeline migrate \
  --source-dir ../../data/recipes \
  --no-publish  # Import as draft first

# Manual review of imported recipes
# Then publish good ones:
python -m recipe_pipeline publish --all-drafts
```

---

## 6. Testing Strategy

### 6.1 Test Matrix

| Scenario | Flag State | Expected Behavior |
|----------|------------|-------------------|
| Default (new deploy) | All OFF | Exact current behavior |
| Supabase enabled | RECIPE_SOURCE_SUPABASE=true | Fetch from Supabase, fallback to local |
| API v2 enabled | RECIPE_API_V2=true | v2 endpoints active |
| Full new stack | All ON | Full new behavior |
| Supabase down | RECIPE_SOURCE_SUPABASE=true | Graceful fallback to local |

### 6.2 Required Tests

```python
# tests/test_backward_compatibility.py

class TestBackwardCompatibility:
    """Ensure new code doesn't break existing behavior."""
    
    async def test_frontend_payload_still_works(self):
        """Frontend can still send recipe payload (current behavior)."""
        # ...
    
    async def test_local_files_still_work(self):
        """Local recipe files still load when Supabase disabled."""
        # ...
    
    async def test_v1_api_unchanged(self):
        """v1 API endpoints return same response format."""
        # ...
    
    async def test_graceful_fallback_on_supabase_error(self):
        """System falls back gracefully if Supabase unavailable."""
        # ...
```

### 6.3 Integration Test Checklist

Before merging to main:

- [ ] All existing tests pass
- [ ] App works with all feature flags OFF
- [ ] App works with each flag ON individually
- [ ] App works with all flags ON
- [ ] Supabase connection failure → graceful fallback
- [ ] Performance: API response time < 200ms
- [ ] Load test: 100 concurrent recipe fetches

---

## 7. Rollout Phases

### Phase 0: Preparation (Before Any Code)

```bash
# 1. Create feature branch
git checkout main
git pull origin main
git checkout -b feature/recipe-data-platform
git push -u origin feature/recipe-data-platform

# 2. Protect the feature branch in GitHub
# Settings → Branches → Add rule: feature/recipe-data-platform
# - Require PR reviews
# - Require status checks
```

### Phase 1: Infrastructure (Week 1)

| Task | PR Target | Breaking? |
|------|-----------|-----------|
| Add feature flag system | feature branch | No |
| Create database schema (new tables only) | Apply directly to Supabase | No |
| Add environment variables to .env.example | feature branch | No |

**Merge to main**: ✅ Safe (no behavior change, flags are OFF)

### Phase 2: Backend Services (Week 2)

| Task | PR Target | Breaking? |
|------|-----------|-----------|
| RecipeService in backend-voice | feature branch | No (flag OFF) |
| API v2 endpoints in backend-search | feature branch | No (flag OFF) |
| Migrate existing recipes to Supabase | Run script | No |

**Merge to main**: ✅ Safe (new code behind flags)

### Phase 3: Frontend Integration (Week 3)

| Task | PR Target | Breaking? |
|------|-----------|-----------|
| Add API fetching with fallback | feature branch | No (flag OFF) |
| Add step-complete event | feature branch | No (flag OFF) |
| Update environment files | feature branch | No |

**Merge to main**: ✅ Safe (new code behind flags)

### Phase 4: Gradual Rollout (Week 4)

```bash
# Day 1: Enable for developers only
# Set in development environment only
FF_RECIPE_SOURCE_SUPABASE=true
FF_RECIPE_API_V2=true

# Day 3: If stable, enable in staging
# Deploy to staging with flags ON

# Day 5: Enable in production (10%)
# Use traffic splitting or user targeting

# Day 7: Full rollout (100%)
FF_RECIPE_SOURCE_SUPABASE=true
FF_RECIPE_API_V2=true
FF_STEP_COMPLETE_EVENTS=true
```

### Phase 5: Cleanup (Week 5+)

Only after 1+ week of stable production:

```bash
# Create cleanup PR (can be done later)
# - Remove feature flag checks
# - Remove local recipe loading code
# - Remove /public/recipes/ folder
# - Update documentation
```

---

## 8. Rollback Procedures

### 8.1 Instant Rollback (Feature Flags)

```bash
# If issues detected, immediately disable:
FF_RECIPE_SOURCE_SUPABASE=false
FF_RECIPE_API_V2=false

# No deployment needed - just env var change
# App immediately reverts to old behavior
```

### 8.2 Code Rollback

```bash
# If feature branch has issues:
git checkout main
git revert <merge-commit>  # Revert the merge
git push origin main

# Redeploy main branch
```

### 8.3 Database Rollback

New tables don't affect existing ones, so:
- No rollback needed for schema
- If data issues: recipes table can be truncated/dropped without impact

---

## 9. Team Communication

### 9.1 Announcement Template

```markdown
## 🚀 Recipe Data Platform - Development Started

**Branch**: `feature/recipe-data-platform`
**Tracking Doc**: `docs/architecture/RECIPE_DATA_PLATFORM.md`

### What's Changing
- Supabase becomes single source of truth for recipes
- New API v2 endpoints for recipe access
- Recipe enhancement pipeline for quality improvement

### What's NOT Changing (Yet)
- Current app behavior (all changes behind feature flags)
- Existing API v1 endpoints
- Local recipe files (kept as fallback)

### How to Collaborate
1. Branch from `feature/recipe-data-platform`, not `main`
2. Use naming: `rdp/XX-description`
3. PRs go to feature branch first
4. Weekly sync call: [schedule]

### Questions?
Reach out to @anibal or comment on this thread.
```

### 9.2 PR Template Addition

Add to `.github/pull_request_template.md`:

```markdown
## Recipe Data Platform PRs

If this PR is part of the Recipe Data Platform epic:

- [ ] Branch created from `feature/recipe-data-platform`
- [ ] PR targets `feature/recipe-data-platform` (not `main`)
- [ ] Feature flag added if new behavior
- [ ] Backward compatibility maintained
- [ ] Tests added for both flag states
```

---

## 10. Summary Checklist

### Before Starting

- [ ] Feature branch created and protected
- [ ] Team notified of approach
- [ ] Feature flag system implemented
- [ ] Database schema applied (new tables only)

### During Development

- [ ] Each PR is small and focused
- [ ] Each PR includes tests
- [ ] Feature flags control new behavior
- [ ] Weekly sync from main to feature branch
- [ ] Code review by at least 1 team member

### Before Merging to Main

- [ ] All tests pass with flags OFF
- [ ] All tests pass with flags ON
- [ ] Manual QA in staging environment
- [ ] Performance benchmarks acceptable
- [ ] Rollback procedure documented and tested

### After Merging to Main

- [ ] Monitor error rates
- [ ] Gradual flag rollout (dev → staging → prod %)
- [ ] Keep flags OFF in production initially
- [ ] Team standup to discuss rollout timing

---

## Appendix: Quick Reference

### Git Commands

```bash
# Start new work
git checkout feature/recipe-data-platform
git pull origin feature/recipe-data-platform
git checkout -b rdp/XX-my-task

# Sync with main (weekly)
git checkout feature/recipe-data-platform
git pull origin main
git push origin feature/recipe-data-platform

# Submit PR
git push origin rdp/XX-my-task
# Create PR: rdp/XX-my-task → feature/recipe-data-platform
```

### Feature Flag Quick Reference

```bash
# Development (try new features)
FF_RECIPE_SOURCE_SUPABASE=true
FF_RECIPE_API_V2=true
FF_STEP_COMPLETE_EVENTS=true

# Production (safe defaults)
FF_RECIPE_SOURCE_SUPABASE=false
FF_RECIPE_API_V2=false
FF_STEP_COMPLETE_EVENTS=false
```
