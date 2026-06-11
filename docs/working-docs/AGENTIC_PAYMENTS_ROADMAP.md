# Agentic Payments Roadmap

**Status:** Living document — updated as of 2026-06-11  
**Audience:** Engineering, product, and Supertab partnership stakeholders  
**Architecture reference:** [AGENTIC_PAYMENTS_ARCHITECTURE.md](AGENTIC_PAYMENTS_ARCHITECTURE.md)

---

Phase 1 ships the foundational capability: a user grants a session spend mandate from an inline consent card (chat thread or recipe sheet), and the backend silently charges subsequent recipe unlocks against that mandate without any further payment modal. Purchases are settled authoritatively via Svix-verified webhooks; the backend is the sole pricing authority; the agent never holds credentials or executes payment logic. Each subsequent phase builds on that foundation — Phase 2 makes the consent state server-held so any surface (chat, sheet, voice, second device) can render and resolve the same ask, and hardens the trust boundary; Phase 3 productizes mandate management, locks in the design decisions as portable primitives, and extracts the shared services for reuse beyond Jamie Oliver AI.

---

## This release (Phase 1)

| Item | Rationale |
|---|---|
| In-chat and on-sheet consent card (session spend mandate grant, $10 ceiling) | Gives the user a single moment of explicit authorization that covers the whole session; subsequent unlocks charge silently, removing friction while keeping the user in control. |
| Backend-priced one-time offerings at $0.05 (backend is the pricing authority) | Prevents the client or LLM from influencing price; the backend mints a concrete Supertab offering and the frontend executes only against that backend-issued id. |
| Receipt chip: app-asserted in-thread purchase confirmation (being added to PR #67) | Closes the feedback loop after a silent charge — the user sees a deterministic, app-generated confirmation rather than relying on the LLM to narrate the outcome. |
| Webhook reconciliation verified in production | Svix-signed `purchase.completed` events are the authoritative entitlement record; the optimistic client sync is a UX fast-path only. |
| Supertab-approved copy pack (pending CEO review — see SUPERTAB_COPY_REVIEW.md) | Ensures every user-facing string in the payment flows is consistent with Supertab brand requirements before production launch. |

---

## Phase 2 — Trust and voice

### Server-side ask state

Move the pending consent from a frontend module-level singleton (`spendMandateConsentGate.ts`) into a server-held mandate finite state machine with states `requested -> active | declined`. The FSM record is created when the agent emits `spend_mandate_consent_requested` and resolved when any surface calls the backend resolution endpoint.

**Rationale:** The current singleton lives in memory in one browser tab. It cannot be shared across devices, cannot survive a page reload, and cannot be resolved by a voice input handler running in a separate context. Making the ask a server-held state is the architectural keystone that enables every other Phase 2 item.

**Dependency:** Prerequisite for voice verbal approval and for any undo window design that defers execution.

### Voice verbal approval

The agent reads price and ceiling aloud; the user's spoken yes/no is transcribed, mapped to `approved: true/false`, and sent to the same backend resolution endpoint that the visual consent card uses. The approved copy pack from Phase 1 governs the spoken wording directly.

**Rationale:** Voice is the natural next surface for agentic consent — the interaction model is identical to the visual card, just resolved through a different input modality.

**Dependency:** Requires server-side ask state (above). Spoken wording inherits the Supertab-approved copy pack from Phase 1.

### Payment undo window (30 seconds)

Two designs are being evaluated:

**Design A (preferred) — instant execution with void/refund:** The purchase fires immediately after user approval; a 30-second undo button appears in the receipt chip. Pressing undo calls the Supertab Merchant API to void or refund the unsettled tab line item, then revokes the entitlement. Depends on Supertab confirming void/refund support for unsettled tab lines — see question 6 in SUPERTAB_COPY_REVIEW.md.

**Design B (fallback, no provider dependency) — deferred execution:** Entitlement is granted optimistically immediately after approval; the actual purchase call is deferred until the undo window elapses or the user takes a first cooking interaction (whichever comes first). If the user taps undo during the window, no charge is ever issued.

The purchase is modeled as a state machine in both designs: `pending -> completed -> (undone | settled)`. Undo is legal only within the window; after settlement the line is closed.

**Rationale:** At $0.05 the undo is not money protection — it is a trust signal. Users who approve a silent charge and then regret it need a low-friction escape hatch that does not require contacting support.

**Dependency (Design A):** Supertab Merchant API void/refund support (question 6, SUPERTAB_COPY_REVIEW.md). Design B has no external dependency.

### Trust hardening

The backend resolves the authenticated user from a verified Supertab access token supplied by the frontend, rather than accepting a client-supplied `user_id` field. The `SupertabTokenVerifier` validates the token and the resolved subject must match all mandate and offering requests.

**Rationale:** The current client-supplied `user_id` path means a misconfigured or malicious client can mint offerings or grant mandates for arbitrary users. This is acceptable in a demo context but is a hard prerequisite for any production-safe silent grant path. See Section 9 of the architecture document for the full trust gap description.

**Dependency:** None — this is self-contained backend work. It is listed last in Phase 2 only because voice and undo depend on server-side ask state first; trust hardening can be parallelized.

---

## Phase 3 — Productization and portability

### Mandate management UX in My Tab

Surface ceiling controls, an "ask every time" mode toggle, a full purchase history with per-item detail, and per-item undo or dispute actions within the Jamie Oliver AI account panel. This gives the user ongoing visibility and control over what the agent has charged on their behalf.

### Primitive cards and ADRs

Publish the design decisions from this implementation as a set of Architecture Decision Records (ADRs) — the output contract of the primitive-design method used to build Phase 1:

| ADR | Decision |
|---|---|
| ADR-001 | Consent grants a session mandate, not per-purchase confirmation |
| ADR-002 | Backend is the sole pricing authority; the frontend never invents offer ids or prices |
| ADR-003 | Webhook-authoritative settlement; optimistic sync is a UX fast-path only |
| ADR-004 | The ask is a mandate state (server-held), not UI state (client singleton) |
| ADR-005 | Undo semantics: instant charge with void (Design A) or deferred execution (Design B) |

These ADRs make the architecture replicable: a team adopting this pattern for a different product can implement each primitive independently against the ADR contract.

### Latency program

App-wide responsiveness work — streaming response latency, consent card render time, and webhook-to-entitlement latency — run as a structured program with targets and instrumentation. Agentic payments amplify perceived latency because the user is waiting for a purchase outcome, not just a page load.

### Switch to live (non-test) Supertab client

Migrate from Supertab test-mode to a production client and validate the full silent-charge path (`actionRequired === false`) against a real Tab with a near-zero balance. Test-mode purchase behavior and webhook delivery differ from production; this milestone is a hard gate before general availability.

### Cross-product extraction

Extract the mandate service, webhook service, and provider adapter interface into a shared library. Implement a second provider adapter (non-Supertab) to validate the abstraction boundary. Register the commerce capability manifest with an external agent directory or as an MCP tool, so external agents can discover and transact against Jamie commerce capabilities without bespoke integration.

---

## Sequencing logic

Server-side ask state is the first item in Phase 2 — before voice, before undo, before trust hardening — because it is load-bearing for everything else. Voice verbal approval and the undo window both require the ask to exist as a durable server record that survives page reloads and is resolvable from multiple contexts (voice handler, undo endpoint, second device). Building those features on top of a client-only singleton would require backtracking. Trust hardening, by contrast, is independent and can be parallelized once the FSM work is underway. Shipping server-side ask state first also keeps Phase 2 deliverables cleanly sequential: voice approval becomes a thin new resolution path on top of an already-working server FSM, rather than a feature that requires the FSM and voice input to land simultaneously.
