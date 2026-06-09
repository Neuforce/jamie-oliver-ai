# Agentic Tab Payments — Validation Spikes

Runnable proofs for the hypotheses in
[`docs/working-docs/AGENTIC_TAB_PAYMENTS_PRD.md`](../../docs/working-docs/AGENTIC_TAB_PAYMENTS_PRD.md):
**a logged-in Supertab user can have a recipe added to their Tab by voice/agent with no payment modal**,
and the grant is reconciled server-side without trusting the client.

These are throwaway-quality demonstrators, not production code. They run against the
**real** Supertab test client and the **real** Supabase project, using the credentials
already in the repo.

## The four PRD steps and what proves each

| PRD step | Hypothesis | Spike | Runnable now? |
|---|---|---|---|
| **Execute** | `client.api.purchase()` charges the Tab with `actionRequired:false` and **no UI** | `silent-tab-purchase.html` (Spike 1) | ✅ with the test client (sign in once) |
| **Authorize** | AP2-style session spend mandate gates agentic charges | `reconcile_and_mandate.py` (Spike 2) | ✅ against real Supabase |
| **Reconcile** | A verified webhook flips access `locked → owned`, idempotently | `reconcile_and_mandate.py` (Spike 2) | ✅ against real Supabase |
| **Create offer** | Backend mints a one-time offering (the agent's "payment intent") | `mint_onetime_offering.py` (Spike 3) | ⏳ needs a Merchant API key |

## Credentials snapshot

| Capability | Status | Source |
|---|---|---|
| Supertab Customer/test client id | ✅ present | `apps/frontend/.env` (`VITE_SUPERTAB_CLIENT_ID`) |
| Supabase URL + service role key | ✅ present | `apps/backend-search/.env` |
| Supertab **Merchant API** key (`mapi:write`) | ❌ missing | Business Portal → API Keys (one-time setup) |

The Merchant API key is the **only** thing blocking a fully end-to-end headless demo.
Spike 1 works around it by purchasing the site's **pre-defined** offerings (no Merchant API call required).

---

## Spike 1 — Modal-free Tab purchase (the crux)

Pure Supertab.js + Customer API. No React, no paywall modal, no purchase-button widget.
It logs any `window.open` loudly, so the "no UI" claim is auditable.

**Run** (served from the frontend origin so Supertab SSO redirect works):

```bash
cd apps/frontend && npm install && npm run dev
# open http://localhost:3000/spikes/silent-tab-purchase.html
```

**Demo:**
1. Click **Sign in to Supertab** (one-time identity step — *not* a payment step).
2. The Tab panel fills in (total, limit, currency).
3. Pick a pre-defined offering, click **Check entitlement (before)** → "not entitled".
4. Click **Put it on my Tab silently → api.purchase()**.
5. Read the verdict:
   - `actionRequired:false` + `status: completed/pending` → **✅ modal-free charge confirmed**, and the runtime log shows **no `window.open`**.
   - `actionRequired:true` → the **fallback** case where today's paywall modal would appear (e.g. tab limit / payment method needed).

This is the exact call an agent or voice tool makes — there is no DOM clicking.

---

## Spike 2 — Webhook reconcile + session spend mandate (server side)

Stdlib-only Python. Runs the full **authorize → gate → reconcile → access → idempotency**
loop against the live database, then cleans up after itself.

```bash
cd spikes/agentic-tab-payments

python3 reconcile_and_mandate.py            # auto-picks a recipe you don't own; shows locked→owned
python3 reconcile_and_mandate.py --user jbrowne@supertab.co --ceiling 500
python3 reconcile_and_mandate.py --recipe a-basic-risotto-recipe
python3 reconcile_and_mandate.py --cleanup  # remove every row this spike created
```

What you'll see (verified output):
- `Access BEFORE: locked`
- mandate granted (e.g. up to $10.00), charge gated under the ceiling
- a Supertab-shaped `purchase.completed` event processed → purchase + entitlement written, mandate decremented
- `Access AFTER: owned` (mirrors `access_service.py`)
- replaying the same event = **no-op** (idempotent, no double-grant)

**Safety:** every row is tagged `spike-agentic-tab`. `--cleanup` deletes only those rows;
it never touches real users, real purchases, or real entitlements. The two tables this
relies on (`spend_mandates`, `webhook_events`) were added additively via migration
`0003_agentic_tab_payments_spike` and are part of the proposed design.

---

## Spike 3 — Mint a one-time offering (Merchant API)

Server-to-server. Surfaces the one credential gap; ready to run the moment a key exists.

```bash
export SUPERTAB_MAPI_CLIENT_ID=...        # Business Portal → API Keys
export SUPERTAB_MAPI_CLIENT_SECRET=...    # shown once on creation
cd spikes/agentic-tab-payments
python3 mint_onetime_offering.py --content-key "recipe:a-basic-risotto-recipe:cook" --price 199
```

It exchanges client credentials for a token, `POST`s `/mapi/onetime_offerings` with a
`content_key` in metadata, and prints the `onetime_offering.…` id. That id is then
purchasable headlessly via Spike 1's `api.purchase({ onetimeOfferingId })`.

Without the key it exits cleanly (code 2) with setup instructions.

---

## Suggested 5-minute presentation flow

1. **Frame it** with the PRD diagram: `authorize → create offer → execute → reconcile`.
2. **Spike 1** live: sign in once, click "Put it on my Tab silently", point at the
   verdict + the empty `window.open` log → *the charge happened with no modal*.
3. **Spike 2** live: run `reconcile_and_mandate.py` → *locked → owned, mandate enforced,
   idempotent* — the trustworthy server side an agent needs.
4. **Spike 3**: show the script + the single missing credential → *the only thing between
   us and a fully headless agentic purchase is a Merchant API key*.
5. Close on the PRD rollout phases.

## End-to-end target (once the MAPI key lands)

```
voice/agent intent
  → check session spend mandate (Spike 2 logic)
  → backend mints one-time offering (Spike 3)
  → client.api.purchase({ onetimeOfferingId })  — silent, actionRequired:false (Spike 1)
  → Supertab webhook purchase.completed
  → backend reconciles entitlement, decrements mandate (Spike 2)
  → recipe access flips to owned → cooking starts
```
