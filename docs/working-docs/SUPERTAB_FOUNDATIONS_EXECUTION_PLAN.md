# Supertab Foundations Execution Plan

## Purpose
This document translates the Supertab Monetization PRD into the first implementation phase. The goal of this phase is to create the backend and data foundations for identity, recipe access states, entitlements, and durable cooking sessions without yet shipping the full paywall UX.

## Phase Goal
End the phase with:
- new data models for users, identities, offerings, purchases, entitlements, and cooking sessions
- seeded free vs paid recipe offerings
- a server-side recipe access-state contract
- a Jamie identity bootstrap contract for Supertab-linked users
- the first durable cooking-session create/get flow

## Scope

### In Scope
- Prisma schema extensions
- migration generation and seed updates
- recipe access-state service
- access endpoint
- Supertab identity bootstrap endpoint
- persistent cooking-session groundwork in backend-voice
- environment and docs updates required for the new foundation

### Out Of Scope
- full Supertab paywall UI
- purchase-button rendering
- full frontend entitlement gating
- webhook reconciliation logic
- final pause/resume UX
- final owned-state surfaces in discovery and recipe details

## Build Order

### Step 1: Extend the database schema
Files:
- `packages/database/prisma/schema.prisma`

Models to add:
- `User`
- `ExternalIdentity`
- `RecipeOffering`
- `Purchase`
- `Entitlement`
- `CookingSession`

Enums to add:
- `IdentityProvider`
- `OfferingStatus`
- `PurchaseProvider`
- `PurchaseStatus`
- `EntitlementStatus`
- `CookingSessionStatus`

### Step 2: Generate and inspect migration
Goal:
- verify keys, indexes, and relations before building API logic

### Step 3: Seed recipe offerings
Files:
- `packages/database/prisma/seed.ts`

Requirements:
- one offering per recipe
- deterministic `contentKey`
- mark a small recipe set as free

### Step 4: Add backend-search service layer
Files to create:
- `apps/backend-search/recipe_search_agent/identity_service.py`
- `apps/backend-search/recipe_search_agent/entitlements_service.py`
- `apps/backend-search/recipe_search_agent/access_service.py`

Responsibilities:
- internal user resolution from Supertab identity
- entitlement lookup
- recipe access-state resolution

### Step 5: Expose access and bootstrap APIs
Files:
- `apps/backend-search/recipe_search_agent/api.py`

Endpoints:
- `POST /api/v1/auth/supertab/bootstrap`
- `GET /api/v1/me`
- `GET /api/v1/recipes/{recipe_id}/access`

### Step 6: Add durable cooking-session groundwork
Files:
- `apps/backend-voice/src/services/session_service.py`
- `apps/backend-voice/src/main.py`
- `apps/backend-voice/src/services/recipe_service.py`

Requirements:
- persistent session snapshot model
- create/retrieve endpoints
- seam for future entitlement-aware cooking access

## Acceptance Criteria
- schema supports the new domain
- recipes have seeded offerings
- access-state resolves to `free`, `locked`, or `owned`
- backend can create or reuse a Jamie user from Supertab identity input
- backend can create and retrieve a durable cooking session snapshot

## Validation Checklist
- free recipe returns `free`
- paid recipe without entitlement returns `locked`
- paid recipe with entitlement returns `owned`
- repeated bootstrap reuses the same user identity
- cooking session create/get roundtrip works

## Suggested Follow-up PRs
- PR 2: Supertab paywall integration on locked start-cooking CTA
- PR 3: purchase reconciliation and owned-state UX
- PR 4: full pause/resume and timer restore behavior
