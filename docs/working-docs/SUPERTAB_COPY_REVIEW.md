# Supertab Copy Review — Jamie Oliver AI

**Purpose:** Complete inventory of every user-facing string (text and voice) in the Jamie Oliver AI payment flows, for Supertab brand review and approval.
**Date:** 2026-06-11 · **Branch:** `feat/demo-ready-agentic-flow` (PR #67)
**How to review:** Every string below is quoted exactly as shipped. Mark each line Approve / Change, and propose replacement wording inline.

---

## 1. Agentic consent — the core ask

Shown when the user asks Jamie (text or voice) to put a recipe on their Tab and no spend mandate exists yet for the session. Rendered inline in the chat thread **and** on the recipe sheet (same component, `SpendMandateConsentInline.tsx`).

| Element | Copy |
|---|---|
| Ask | "Mind if I put this on your Tab? It's **$0.05** for this recipe — I won't charge again this session without asking (up to **$10.00** total)." |
| Approve button | "Yes, put it on my Tab" |
| Decline button | "Not now" |

Notes for review:
- Price and ceiling are dynamic ($0.05 per recipe, $10.00 session ceiling currently).
- This grants a session spend mandate (AP2-style); subsequent unlocks under the ceiling charge silently with no further ask.

## 2. Recipe sheet — manual unlock pane

`SupertabPurchaseButton.tsx`, shown on every locked recipe sheet.

| Element | Copy | Trigger |
|---|---|---|
| Pane intro | "Unlock this recipe to cook with Jamie step by step." | Always (locked) |
| Embedded button label | "Put it on my Tab" | Supertab SDK button, forced `language: 'en'` |
| Footer | "Secured by Supertab" | Always |
| Loading | "Loading checkout…" | While SDK mounts |
| Fallback button | "Unlock this recipe" / "Opening…" | When embed unavailable |
| Status — purchase done | "Purchase completed. Jamie is refreshing your access now." | After successful purchase |
| Status — already owned | "This recipe is already available in your My Tab account." | Prior entitlement |
| Status — signed in, not purchased | "My Tab is connected. Complete the Supertab flow above to unlock this recipe." | Signed-in resolution without purchase |
| Status — not configured | "Supertab checkout is not configured for this recipe." | Missing config |
| Status — abandoned | "Checkout closed before the recipe was unlocked." | User closed checkout |
| Status — error | "We could not open My Tab checkout right now." | Unexpected failure |
| Status — no client ID | "Add your Supertab client ID to load the official purchase button." | Missing env config (internal) |
| Status — embed unavailable | "Use My Tab checkout below to unlock this recipe." | Embed cannot mount |
| Status — recipe not configured | "This recipe is not configured for My Tab yet. Please try again soon." | Missing offering |
| Status — missing content key | "This recipe is missing a Supertab content key, so the purchase button cannot load." | Config error (internal) |
| Status — SDK launch failure | "Supertab could not launch the purchase button flow." | SDK `show()` failure |
| Status — sync failure | "We could not sync your Supertab purchase back to Jamie." | Post-purchase sync error |

## 3. Toasts (transient notifications, `App.tsx`)

| Title | Description | Trigger |
|---|---|---|
| "Recipe unlocked" | "Jamie is ready to start cooking with you." | Successful unlock |
| "No problem — nothing was charged" | "The recipe stays locked. Ask me again or tap Unlock whenever you're ready." | User declined consent / abandoned |
| "Your Tab needs settling first" | "Tap Unlock on the recipe to pay now — I can't charge silently until your Tab has headroom." | Supertab `actionRequired: true` (Tab limit) |
| "Could not open My Tab" | "Sign in to Supertab or set the client ID for this environment." | Auth/config unavailable |
| "Could not unlock via My Tab" | "Please try again or use Unlock on screen." | Unexpected purchase error |
| "Checkout did not match this recipe" | "Close the modal and open the recipe again, or tap Unlock on screen." | Recipe resolution failure |
| "Could not check recipe access" | "Please try opening checkout from the Unlock button." | Access lookup failure |
| "Agent spending revoked" | "Jamie will ask before adding unlocks to your Tab again." | User revokes mandate |
| "Could not revoke agent spending" | — | Revoke failure |

## 4. My Tab card (account surface, `App.tsx`)

| Element | Copy | State |
|---|---|---|
| Title | "My Tab" | Always |
| Headline | "Unlock recipes with My Tab" | Signed out |
| Headline | "*N* recipes unlocked" | Signed in |
| Headline | "My Tab unavailable" | Config missing |
| Description | "Buy once and your unlocked recipes stay here." | Signed out |
| Description | "Balance $X.XX of $Y.YY tab limit." | Signed in with balance |
| Description | "Your Supertab account is connected and ready for recipe unlocks." | Signed in, no balance data |
| Helper | "Use the Supertab purchase flow on any locked recipe to get started." | Signed out |
| Helper | "Your owned recipes stay synced into My Recipes." | Signed in |
| Mandate line | "Agent spending: X.XX USD remaining this session" | Active mandate |
| Action | "Revoke agent spending" | Active mandate |
| Error | "We could not load/open My Tab right now. Please try again in a moment." | Load/open failure |

## 5. Recipe badges (chat cards and carousels)

| Badge | State |
|---|---|
| "Locked · $0.05" | Locked, priced offering |
| "Locked" | Locked, no price |
| "Free" | Free recipe |
| "Unlocked" | Owned |

## 6. Voice and agent speech (generated, governed by prompt)

Jamie's spoken/written words are generated by the LLM, governed by `prompts.py`. The governing rules (paraphrased from the prompt, exact file: `apps/backend-search/recipe_search_agent/prompts.py`):

- After the unlock tool runs, Jamie says he will **ask for approval right there in the conversation** — a confirmation card ("Mind if I put this on your Tab?" with Yes / Not now) appears in chat and on the recipe sheet.
- Jamie must **never** claim checkout finished, never say "I've put it on your tab", "it's on your tab now", "you're all set", or narrate the purchase as already done.
- Jamie never claims ownership/entitlement the app hasn't confirmed.

Representative generated lines (what users will typically hear/read):

> "Happy to! I'll ask for your approval right here — just confirm and I'll put it on your Tab."

> "Of course — you'll see a quick confirmation card; once you say yes, the recipe unlocks straight onto your Tab."

Voice mode today: the consent card is visual (user taps Yes / Not now). Verbal approval ("yes, go ahead") is the planned Phase 2 — it will resolve the same consent state, so approved wording here carries over directly.

## 7. Terminology conventions used throughout

| Term | Usage |
|---|---|
| "My Tab" | The user-facing account/checkout surface |
| "Tab" (capital T) | The running balance ("put it on your Tab", "your Tab needs settling") |
| "Supertab" | The brand — used for the account, the flow, and "Secured by Supertab" |
| "Agent spending" | The session spend mandate, user-facing |
| "Unlock" | The action of buying access to a recipe |

---

**Open questions for Supertab:**
1. Is "Put it on my Tab" / "put this on your Tab" the preferred verb phrase, or is there canonical Supertab phrasing?
2. "Secured by Supertab" — correct attribution line, or is there an official badge/wording requirement?
3. Is "your Tab needs settling" acceptable, or does Supertab prefer different language for the limit/`actionRequired` state?
4. Session ceiling phrasing: "up to $10.00 total" — should this reference the Tab limit concept explicitly?
5. Any constraints on using "My Tab" as a first-class surface name inside a partner product?
6. Does the Supertab Merchant API support voiding or refunding an unsettled tab line item? This is needed to implement the preferred 30-second undo design (Design A): the purchase fires immediately on user approval, the receipt chip shows an undo button for 30 seconds, and pressing undo calls the Merchant API to void/refund the unsettled line and revokes the entitlement client-side. If void/refund of an unsettled line is not supported, we fall back to Design B (deferred execution: entitlement granted optimistically, purchase call fired after the undo window elapses or on first cooking interaction). See AGENTIC_PAYMENTS_ROADMAP.md Phase 2 for full design detail.

---

## 8. Receipt chip (new, pending approval)

Shown in the chat thread and on the recipe sheet immediately after a successful silent purchase. This string is app-asserted — generated deterministically by the frontend on a verified purchase event, never by the LLM.

| Element | Copy |
|---|---|
| Main line | "\<Recipe title\> — $0.05 on your Tab" |
| Secondary line | "Confirmed by the app · Secured by Supertab" |

Notes for review:
- Recipe title is substituted dynamically; the price ($0.05) is the backend-authoritative value from the purchase record, not a client-hardcoded constant.
- "Confirmed by the app" distinguishes this chip from anything the LLM might say — it signals to the user that the confirmation is deterministic and authoritative, not a model inference.
- "Secured by Supertab" mirrors the attribution line already in use on the recipe sheet purchase pane (section 2 above).
- The chip renders after the webhook-verified purchase event or after the optimistic sync fast-path; it does not render on a failed or abandoned purchase attempt.
