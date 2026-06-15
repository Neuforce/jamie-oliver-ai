# Supertab Copy Review — Jamie Oliver AI

**Purpose:** User-facing strings for Supertab brand review.  
**Date:** 2026-06-13 · Consolidation PR (recover agentic payment fixes)

---

## 1. Agentic consent (inline + portaled above recipe sheet)

| Element | Copy |
|---|---|
| Ask | "Mind if I put this on your Tab? It's **$0.05** for this recipe — I won't charge again this session without asking (up to **$10.00** total)." |
| Approve | "Yes, put it on my Tab" |
| Decline | "Not now" |

---

## 2. Receipt chip (after silent or settled purchase)

| Element | Copy |
|---|---|
| Main | "\<Recipe title\> — $0.05 on your Tab" |
| Secondary | "Confirmed by the app · Secured by Supertab" |

---

## 3. Designed branches (not errors)

| Situation | Copy |
|---|---|
| No headroom → settle-and-pay | Toast: "Settle your Tab to unlock" / "Complete the checkout on screen to put this recipe on your Tab." |
| Declined / abandoned | "No problem — nothing was charged" / "The recipe stays locked. Ask me again or tap Unlock whenever you're ready." |
| Already owned | "You already have this recipe" / "Jamie is ready to start cooking with you." |
| Not connected (first-timer) | "Connect My Tab to unlock recipes" / "Open the menu and connect your Tab — it only takes a moment." + action "Connect My Tab" |
| Purchase success | "Recipe unlocked" / "Jamie is ready to start cooking with you." |

---

## 4. Recipe sheet — manual unlock pane

| Element | Copy |
|---|---|
| Embedded button | "Put it on my Tab" (English, `language: 'en'`) |
| Footer | "Secured by Supertab" |

---

## 5. Terminology

| Term | Usage |
|---|---|
| "My Tab" | User-facing account surface |
| "Tab" | Running balance ("put it on your Tab") |
| "Supertab" | Brand + "Secured by Supertab" |
| "Agent spending" | Session spend mandate |

---

## 6. Voice (spoken) consent  [NEW — NEU-671]

Voice renders the same consent card as Section 1; these are the additional
spoken (TTS) lines when the user resolves the ask by voice.

| Trigger | Spoken line |
|---|---|
| Ask (offer) | Inherits Section 1 (card copy read aloud) |
| Ambiguous | "Just to be sure — do you want me to put this on your Tab? Please say yes or no." |
| Grant | "Great — I've put that on your Tab." |
| Not connected | "I need you connected to My Tab first — tap Yes on screen, or connect your Tab in the menu." |
| Decline | "No problem — we can skip that for now." |

---

## Open questions for Supertab

1. Preferred verb: "Put it on my Tab" vs canonical Supertab phrasing?
2. Settle-and-pay branch wording when Tab needs settlement?
3. Void/refund unsettled tab lines for 30s undo (NEU-672)?
4. Voice confirmation timing: is "I've put that on your Tab" acceptable at grant time, or should the spoken confirmation wait until the charge actually settles (today it is spoken before the purchase completes)?
5. Canonical spoken decline wording — align voice ("we can skip that for now") with the card's decline copy ("No problem — nothing was charged")?
