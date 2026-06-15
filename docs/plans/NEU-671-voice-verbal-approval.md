---
title: Voice verbal approval for spend consent (NEU-671)
linear: NEU-671
depends_on: NEU-670
repo: jamie-oliver-ai
branch: feat/neu-671-voice-verbal-approval
overview: >
  Spoken "yes/no" resolves the SAME server-side consent ask as the chat/sheet
  buttons — one FSM, no parallel flow. The core path is already implemented and
  merged on main (voice_handler._try_verbal_consent_resolution + consent_intent +
  resolve_ask source="voice"). This plan covers verification, closing the
  approve->purchase continuation seam, hardening edge cases, and tests.
todos:
  - id: verify-happy-path
    content: "Prod-verify voice grant: open ask -> say yes -> mandate minted -> recipe unlocks & cooks (one charge)"
    status: pending
  - id: continuation-seam
    content: "Confirm/close the voice approve->purchase continuation: resolveAsk() must drive startRecipeUnlock the same as the button"
    status: pending
  - id: decline-and-ambiguous
    content: "Verify decline path and ambiguous re-prompt loop (yes/no), including repeated ambiguity"
    status: pending
  - id: not-connected
    content: "Verify user_id_required_for_grant path: spoken yes when Tab not connected -> guidance, no silent mandate"
    status: pending
  - id: expiry-and-idempotency
    content: "Verify expired ask (>5 min) and double-yes idempotency don't double-mint/charge"
    status: pending
  - id: barge-in
    content: "Verify consent resolution survives barge-in/interrupt without dropping the ask or duplicating turns"
    status: pending
  - id: tests
    content: "Add backend tests for _try_verbal_consent_resolution branches; extend consent_intent coverage; frontend resolved->unlock test"
    status: pending
---

# Plan: Voice verbal approval for spend consent (NEU-671)

**Ticket:** [NEU-671](https://linear.app/neuforce/issue/NEU-671/voice-verbal-approval-for-spend-consent)
**Depends on:** [NEU-670](https://linear.app/neuforce/issue/NEU-670) — server-side ask FSM (shipped)
**Branch:** `feat/neu-671-voice-verbal-approval`

## TL;DR — this is mostly built; the job is to make it trustworthy

The verbal-approval path already landed on `main` as part of the commerce work.
This is **not** a greenfield build. Per our engineering principles, we verify the
existing path, close the one real seam, harden the edges, and lock it with tests —
rather than introduce a second voice consent flow.

## What already exists (merged on `main`)

| Layer | Component | Behavior |
|---|---|---|
| Backend | `consent_intent.classify_consent_utterance` | Conservative grant / decline / ambiguous classifier |
| Backend | `voice_handler._try_verbal_consent_resolution` | If an open ask exists for the session, intercept the utterance *before* the LLM, classify, and resolve |
| Backend | `spend_mandate_ask_service.resolve_ask(grant, source="voice")` | Same FSM the buttons use; grant mints the mandate, decline/expire transition the ask |
| Backend → FE | `spend_mandate_consent_resolved` WS event | `{ backend_recipe_id, ask_id, approved }` |
| Frontend | `useVoiceChat` → `onSpendMandateConsentResolved` | Forwards to `ChatView` |
| Frontend | `ChatView` → `commerceStore.resolveAsk(bid, approved)` | Resolves the pending client ask promise |

Key property already satisfied: **one ask state machine** for buttons and voice
(`resolve_ask`), and ambiguous speech re-prompts ("say yes or no") instead of guessing.

## Definition of done

A user in **voice mode**, with a recipe that requires consent, can say "yes, put it
on my tab" (or "no") and:

1. The **same** server ask is resolved (no second flow, no double-mint).
2. On grant: mandate is minted once, the recipe **purchases and unlocks**, and the
   cooking session opens — identical end state to tapping **Yes**.
3. On decline: ask transitions to `declined`, no charge, Jamie acknowledges verbally.
4. Ambiguous speech re-prompts; expired/!connected/double-yes are handled safely.
5. Backend + frontend tests cover the branches above.

## Gap analysis (what to verify / close)

### G1 — Approve → purchase continuation (the one real seam)
`commerceStore.resolveAsk(recipeId, approved)` only resolves the **pending client ask
promise** (`askResolve`) when `activeAsk.recipeId === recipeId && status === 'requested'`.
On the **button** path, `approveUnlock` explicitly calls `resolveAskWithServer` **and
then `startRecipeUnlock`** (`unlockController.ts`). On the **voice** path, the backend
already minted the mandate, and the FE only calls `resolveAsk`.

**Must confirm:** resolving that promise actually drives `startRecipeUnlock` to
completion for voice. If the awaiter of `openAsk()` doesn't continue to purchase on the
voice path, close the gap so voice grant runs the exact same unlock continuation as the
button (single code path), without re-minting the mandate the backend already created.

### G2 — Decline + ambiguous loop
Verify decline transitions the ask and clears the client surface; verify repeated
ambiguous utterances keep re-prompting and never silently grant/charge.

### G3 — Tab not connected (`user_id_required_for_grant`)
Spoken "yes" with no linked Tab must produce the guidance message and **not** mint a
mandate or charge. Confirm the FE surface stays in a recoverable state (can connect Tab
then approve).

### G4 — Expiry + idempotency
- Ask older than `ASK_TTL_MINUTES` (5) → `ask_expired`, no mandate. Confirm the spoken
  path reflects this gracefully.
- Double "yes" (or button + voice racing) must resolve once: `resolve_ask` already
  early-returns on `active|declined|expired` (`already_resolved`), and consumption is
  one-time via `mandate_consumed_at`. Verify no double mandate, no double charge.

### G5 — Barge-in / interrupt interaction
Consent resolution runs inside `_brain_process_internal`, which can be interrupted.
Verify a barge-in during/after "yes" doesn't drop the resolution or duplicate the turn,
and the `spend_mandate_consent_resolved` event still reaches the FE under the active
`responseId`.

## Work breakdown

1. **verify-happy-path** — Prod walkthrough (voice): trigger consent on a no-headroom
   recipe, say "yes", confirm single charge + unlock + cook. Capture logs.
2. **continuation-seam (G1)** — Trace `openAsk` awaiter; ensure voice grant runs the
   same `startRecipeUnlock` continuation as the button. Unify if needed (no parallel
   purchase path, no re-mint).
3. **decline-and-ambiguous (G2)** — Verify/adjust decline + re-prompt loop.
4. **not-connected (G3)** — Verify the unlinked-Tab guidance path.
5. **expiry-and-idempotency (G4)** — Verify expiry + double-yes safety.
6. **barge-in (G5)** — Verify resolution survives interrupt.
7. **tests** — Backend unit tests for `_try_verbal_consent_resolution` (open ask vs
   none, grant/decline/ambiguous, not-connected, expired); extend `consent_intent`
   cases (e.g. "yes but not that one", mixed); frontend test that a `resolved{approved}`
   event drives unlock to completion.

## Test plan

**Automated**
- `uv run pytest` targeting voice consent + ask service + consent_intent.
- Frontend: `commerceStore` resolved→unlock test; `useVoiceChat` event mapping test.

**Manual (production, since Supertab rejects localhost)**
- Voice → recipe needing consent → "yes, put it on my tab" → unlock + cook (one charge).
- Voice → "no" → no charge, verbal ack.
- Voice → mumble/ambiguous → re-prompt → then "yes".
- Voice → "yes" with Tab not connected → guidance, no charge.
- Wait >5 min on an open ask → "yes" → expired handling.

## Out of scope
- Undo window (separate issue).
- Multi-item / cart voice approval.
- New copy — wording inherits the approved consent copy pack.

## Risks
- **Hidden second purchase path** (G1) is the main risk; resolve by reusing the button's
  `startRecipeUnlock` continuation rather than adding a voice-specific purchase.
- STT misrecognition → mitigated by the conservative classifier + ambiguous re-prompt;
  do not loosen grant patterns.
