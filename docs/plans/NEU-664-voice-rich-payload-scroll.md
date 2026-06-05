---
title: Voice rich-card payload priority and scroll (NEU-664)
linear: NEU-664
parent: NEU-644
repo: jamie-oliver-ai
overview: Follow-up to NEU-644. Fix wrong featured payload in voice (carousel vs meal plan), plain-text turn clipping, and stack swipe blocked on Jamie top cards.
todos:
  - id: featured-payload
    content: "Unify voice featured selection with chat (mealPlan > shoppingList > recipeDetail > recipes)"
    status: pending
  - id: voice-long-text
    content: "Disable chat markdown collapse in voice; card-body owns vertical scroll"
    status: pending
  - id: interactive-scope
    content: "Remove blanket data-voice-interactive on Jamie card wrapper"
    status: pending
  - id: tests-qa
    content: "Extend voiceRichCard tests + manual QA checklist from NEU-644 session"
    status: pending
---

# Plan: voice rich-card payload & scroll (NEU-664)

**Follow-up:** [NEU-644](https://linear.app/neuforce/issue/NEU-644) (expand/collapse — Done)  
**Ticket:** [NEU-664](https://linear.app/neuforce/issue/NEU-664)  
**Branch:** `fix/NEU-664-voice-rich-payload-scroll`

## Problem summary

NEU-644 expand/collapse works. QA (2026-06-05) found three separate issues in the same voice flow (meal plan → follow-up recommendation).

| # | Symptom | Cause |
|---|---------|--------|
| 1 | Carousel shows unrelated desserts; collapsed preview says "5 recipes" | `recipes` checked before `mealPlan` in voice preview + expanded hero |
| 2 | Follow-up Jamie text cut off with fade; no inner scroll | `jamie-thread-markdown--collapsed` (chat) applied in voice |
| 3 | Cannot swipe stack on plain-text top card | `data-voice-interactive="true"` on entire top Jamie `card-content` |

## Fix 1 — Single featured payload in voice

**Goal:** One canonical rich surface per message, same order as chat (`selectFeatured` / `getFeaturedToolPart`).

**Changes:**

- `apps/frontend/src/lib/voiceRichCard.ts`
  - Add `getVoiceFeaturedPayload(message)` returning discriminated kind + data.
  - `getVoiceRichCardPreview` and `isVoiceExpandableMessage` use featured only — do not prefer raw `recipes` when `mealPlan` exists.
- `apps/frontend/src/components/ChatView.tsx`
  - `rollerMessages.voiceExpandable` from featured, not any payload field.
  - Expanded hero: render `MealPlanCard` / `ShoppingListCard` / carousel per featured — not `hasRecipes` alone.
  - Remove duplicate carousel when featured is `meal_plan`.
- Tests: meal plan + auxiliary `recipes[]` on same message → preview title/chips are meal plan.

**Reference:** `selectFeatured` in `ProcessCard.tsx` (mealPlan before recipes).

## Fix 2 — Long text in voice mode

**Goal:** Full Jamie prose readable without chat-style 290px clip.

**Changes:**

- `ChatView.tsx` — when `voiceMode`, never apply `jamie-thread-markdown--collapsed`.
- Rely on `voice-roller__card-body` (`overflow-y: auto`, `max-height` in `VoiceModeRoller.css`).
- Optional: hide chat "Read more" in voice (scroll replaces it).

**Verify:** Follow-up turn like "I'd go with Meatballs & Pasta…" scrolls to the closing question.

## Fix 3 — Interactive scope on roller

**Goal:** Stack swipe works on plain-text Jamie top cards; rich expanded scroll unchanged.

**Changes:**

- `VoiceModeRoller.tsx` — remove `data-voice-interactive="true"` from `voice-roller__card-content` for Jamie.
- Keep `data-voice-interactive` only on: Collapse, Expand preview, carousel nav, buttons/links.
- Confirm `handlePointerDown` / `handleWheel` still defer to `canScrollTopBody` when expanded.

**Verify:** Top plain-text card — swipe to prior collapsed meal-plan preview; expanded rich card — inner scroll + horizontal carousel still work.

## Acceptance criteria

- [ ] Meal-plan voice turn: expanded + collapsed show meal plan, not auxiliary recipe carousel.
- [ ] Follow-up plain-text turn: full text readable via card-body scroll.
- [ ] Plain-text top card: stack navigation (swipe/wheel) works.
- [ ] NEU-644 expand/collapse, Collapse bar, carousel `pan-x` unchanged.
- [ ] `npm run build` passes; `voiceRichCard` tests cover featured priority.

## Manual test plan

1. Voice → ask for romantic dinner meal plan → confirm **MealPlanCard** / meal preview (not dessert carousel).
2. Collapse → preview shows occasion/servings, not "N recipes".
3. Ask "what would you recommend?" → new top card scrolls fully; swipe to prior message works.
4. Expand prior rich card → scroll + carousel paging still OK.

## Out of scope

- Backend stopping auxiliary `recipes` on meal-plan tool responses (frontend must tolerate both).
- NEU-644 performance pass (lazy mount, blur cost).
