---
title: Setup permalinks (NEU-635)
linear: NEU-635
repo: jamie-oliver-ai
overview: Stable, shareable URLs for recipes and main app surfaces (deep links + social previews). Frontend URL-sync + browse query params + Vercel OG. No USM or separate PRD required beyond this plan and NEU-635.
todos:
  - id: neu-646-url-sync
    content: "NEU-646 — URL ↔ state (tabs, recipe modal, cook, 404, popstate) — Done in Linear; verify AC"
    status: completed
  - id: neu-647-browse-filters
    content: "NEU-647 — Sync /recipes?category&q&view; hydrate on load; push/replace history"
    status: pending
  - id: neu-648-og-vercel
    content: "NEU-648 — /api/og for /recipe/*; unfurl QA (WhatsApp, Slack, iMessage)"
    status: completed
  - id: neu-635-recipe-routing-fix
    content: "Prod fix — browsers get SPA on /recipe/*; crawlers only → /api/og (vercel.json + middleware.ts)"
    status: completed
  - id: close-epic
    content: "Mark NEU-635 Done after routing fix + manual test checklist on prod"
    status: pending
---

# Plan: setup permalinks (NEU-635)

Parent: [NEU-635](https://linear.app/neuforce/issue/NEU-635/setup-permalinks) · Sub-issues: [NEU-646](https://linear.app/neuforce/issue/NEU-646), [NEU-647](https://linear.app/neuforce/issue/NEU-647), [NEU-648](https://linear.app/neuforce/issue/NEU-648)

**Spec source of truth:** description on NEU-635 (engineering AC). **USM / external design doc:** optional; not required to implement or close the epic.

## Product decisions (8 open questions → resolved defaults)

No round with product needed unless brand/legal objects explicitly. All items below are **assumed for v1** unless NEU-635 is amended.

| # | Topic | Decision for v1 | Rationale |
|---|--------|-----------------|-----------|
| 1 | `/my-recipes` without Supertab session | Open `/my-recipes`; show existing gated UI (connect My Tab / empty owned list), same as in-app navigation | NEU-635 says route is addressable and “requires Supertab session” for content, not redirect elsewhere |
| 2 | SEO vs share | **Share / deep links first**; no SEO initiative in this epic | Ticket targets bookmarks, direct load, OG unfurl; no sitemap, canonical, or schema requirements |
| 3 | OG for `/recipe/<slug>/cook` | **Same preview as recipe detail** (title, description, image for the recipe) | [`apps/frontend/api/og.ts`](../../apps/frontend/api/og.ts) extracts slug from both paths; cook is an in-app mode, not a separate share surface |
| 4 | Locked recipe from external link | **`/recipe/<slug>`** → detail + access flow; **`/recipe/<slug>/cook`** → if `locked`, detail + paywall; if `free`/`owned`, cooking overlay | Stated in NEU-635 behavior rules |
| 5 | Invalid slug vs unpublished recipe | **Single friendly 404** with CTA to `/recipes`; legacy numeric slug → same 404 | NEU-635 AC; API 404 for both cases |
| 6 | Default OG image and copy | Use **in-repo defaults** in `og.ts` until brand requests changes | `DEFAULT_OG_IMAGE`, `DEFAULT_TITLE`, `DEFAULT_DESCRIPTION` already defined |
| 7 | Success metrics | **None required for v1** closure | Epic has no KPIs; add analytics in a follow-up if product asks |
| 8 | UTM / tracking on shared URLs | **Out of scope for v1** | Not in NEU-635; marketing can add later without blocking permalinks |

## Technical context

- SPA state in [`apps/frontend/src/App.tsx`](../../apps/frontend/src/App.tsx); permalink layer in [`permalinks.ts`](../../apps/frontend/src/lib/permalinks.ts) + [`usePermalinks.ts`](../../apps/frontend/src/hooks/usePermalinks.ts).
- Stable id: backend `recipe_id` slug → `recipe.backendId` (not numeric `Recipe.id`).
- Backend: `GET /api/v1/recipes/{slug}`, access for cook via existing access endpoint.
- Deploy: [`vercel.json`](../../apps/frontend/vercel.json) SPA rewrite + [`middleware.ts`](../../apps/frontend/middleware.ts) sends crawlers only to `/api/og`.

### URL scheme (from NEU-635)

| URL | State |
|-----|--------|
| `/` | `activeView = chat` |
| `/recipes` (+ optional `?category=&q=&view=grid\|feed`) | browse + filters |
| `/my-recipes` | owned library (gated) |
| `/recipe/<slug>` | `selectedRecipe` |
| `/recipe/<slug>/cook` | `cookingRecipe` (entitlement-gated) |

**Out of scope:** shareable discovery-chat / search-session links.

## Delivery breakdown

1. **NEU-646** — URL-sync layer (`pushState`, `popstate`, slug fetch, 404, cook access). Linear: **Done** (leave as-is).
2. **NEU-647** — Browse filters in query string; `navigateRecipesFilters` / hydrate in `applyRoute` for `recipes`.
3. **NEU-648** — OG handler + `VITE_API_BASE_URL` on Vercel. Linear: **Done** (leave as-is).
4. **NEU-635 (this plan)** — Prod routing fix (implemented): browsers → SPA; crawlers → `/api/og`. **Redeploy frontend**, then verify checklist.

### Prod routing fix (implemented)

- Removed blanket `/recipe/*` → `/api/og` rewrite from `vercel.json`.
- Added `middleware.ts` (crawler user-agents only).
- Hardened `api/og.ts` (`pathname` query from middleware, `x-forwarded-*` for `og:url`, `includeFiles` for `dist/index.html`).

**Verify after deploy:** `https://<prod>/recipe/<slug>` → page source includes `<script src="/assets/...">`; Cmd+R keeps the recipe open.

## Manual test checklist (epic closure)

- [ ] Open `/recipe/<known-slug>` → modal/recipe; refresh restores recipe.
- [ ] Unknown slug and `/recipe/42` (legacy numeric) → 404 + CTA to `/recipes`.
- [ ] `/recipe/<slug>/cook` — locked vs owned behavior.
- [ ] `/`, `/recipes`, `/my-recipes` — direct load and back/forward.
- [ ] `/recipes?category=…&q=…&view=grid` — share URL reproduces filters.
- [ ] Paste recipe URL in WhatsApp / Slack / iMessage — correct title, description, image (or default).

## Acceptance criteria (from NEU-635)

- Every recipe at `/recipe/<slug>`; URL updates when opening; restore on refresh.
- `/recipe/<slug>/cook` entitlement behavior as above.
- `/recipes` reflects `category`, `q`, `view` from query params.
- Top-level tabs addressable; back/forward work.
- Shared recipe links unfurl correctly.
- Unknown slug → 404, not blank screen.

## Explicitly out of v1

- SEO (indexing strategy, structured data, sitemap).
- UTM / campaign tracking on permalinks.
- Shareable discovery-chat deep links.
- Mandatory analytics KPIs.
