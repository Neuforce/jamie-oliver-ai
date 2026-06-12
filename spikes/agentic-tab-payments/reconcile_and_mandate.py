#!/usr/bin/env python3
"""
Spike 2 - Webhook reconciliation + AP2-style session spend mandate (real Supabase).

Validates the server side of the Agentic Tab Payments PRD:
  authorize (spend mandate) -> execute (simulated charge) -> reconcile (verified webhook)

What it proves, end to end, against the real database:
  1. AUTHORIZE  : create a session spend mandate with a ceiling.
  2. GATE       : the agent only charges if price fits under the mandate ceiling.
  3. RECONCILE  : a Supertab-shaped `purchase.completed` webhook is processed
                  idempotently -> writes purchase + entitlement, decrements the mandate.
  4. ACCESS     : recipe access flips locked -> owned (mirrors access_service.py).
  5. IDEMPOTENT : replaying the same webhook event does not double-grant.

No payment UI, no client trust: entitlement is granted purely from the verified
server-side event, which is exactly how an agentic/voice purchase must settle.

Usage:
  python3 reconcile_and_mandate.py                 # run the full demo (default user/recipe)
  python3 reconcile_and_mandate.py --user anibal@neuforce.ai --recipe 6-hour-slow-roasted-pork-shoulder
  python3 reconcile_and_mandate.py --cleanup       # remove everything this spike created

Credentials: read from apps/backend-search/.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
or from the environment. Service-role key = full access; this is a backend-only spike.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

SPIKE_TAG = "spike-agentic-tab"  # marker used so --cleanup can find what we created

# ----------------------------------------------------------------------------- helpers


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_env() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        env_path = (
            Path(__file__).resolve().parents[2]
            / "apps"
            / "backend-search"
            / ".env"
        )
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                if k == "SUPABASE_URL" and not url:
                    url = v.strip()
                if k == "SUPABASE_SERVICE_ROLE_KEY" and not key:
                    key = v.strip()
    if not (url and key):
        sys.exit(
            "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (env or apps/backend-search/.env)."
        )
    return url.rstrip("/"), key


class Supa:
    """Tiny PostgREST client over stdlib urllib (no third-party deps)."""

    def __init__(self, base_url: str, service_key: str):
        self.rest = f"{base_url}/rest/v1"
        self.key = service_key

    def _request(self, method: str, path: str, *, params=None, body=None, prefer=None):
        url = f"{self.rest}/{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params, safe="*.,()")
        data = json.dumps(body).encode() if body is not None else None
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read().decode()
                return json.loads(raw) if raw else []
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode()
            raise RuntimeError(f"{method} {path} -> {exc.code}: {detail}") from None

    def select(self, table, *, params=None):
        return self._request("GET", table, params=params)

    def insert(self, table, row, *, prefer="return=representation"):
        out = self._request("POST", table, body=row, prefer=prefer)
        return out[0] if isinstance(out, list) and out else out

    def update(self, table, patch, *, params):
        return self._request(
            "PATCH", table, params=params, body=patch, prefer="return=representation"
        )

    def delete(self, table, *, params):
        return self._request("DELETE", table, params=params, prefer="return=representation")


# ----------------------------------------------------------------------------- output


def banner(title: str) -> None:
    print(f"\n\033[1;35m{'=' * 70}\n  {title}\n{'=' * 70}\033[0m")


def step(msg: str) -> None:
    print(f"\033[36m▶ {msg}\033[0m")


def ok(msg: str) -> None:
    print(f"\033[32m✓ {msg}\033[0m")


def warn(msg: str) -> None:
    print(f"\033[33m! {msg}\033[0m")


def money(amount, currency="USD") -> str:
    if amount is None:
        return "—"
    return f"{amount / 100:.2f} {currency}"


# ----------------------------------------------------------------------------- domain


def resolve_user(supa: Supa, who: str) -> dict:
    # accept a uuid or an email/display_name
    if len(who) == 36 and who.count("-") == 4:
        rows = supa.select("users", params={"id": f"eq.{who}", "select": "*"})
    else:
        rows = supa.select(
            "users", params={"display_name": f"eq.{who}", "select": "*"}
        )
        if not rows:
            rows = supa.select("users", params={"email": f"eq.{who}", "select": "*"})
    if not rows:
        sys.exit(f"User not found: {who}")
    return rows[0]


def resolve_offering(supa: Supa, recipe_slug: str) -> tuple[dict, dict]:
    recipes = supa.select(
        "recipes", params={"slug": f"eq.{recipe_slug}", "select": "id,slug"}
    )
    if not recipes:
        sys.exit(f"Recipe not found: {recipe_slug}")
    recipe = recipes[0]
    offerings = supa.select(
        "recipe_offerings",
        params={"recipe_id": f"eq.{recipe['id']}", "select": "*"},
    )
    if not offerings:
        sys.exit(f"No offering for recipe: {recipe_slug}")
    return recipe, offerings[0]


def pick_locked_offering(supa: Supa, user_id: str) -> tuple[dict, dict] | None:
    """Find a paid recipe the user does NOT yet own, so the demo shows locked -> owned."""
    owned = supa.select(
        "entitlements",
        params={
            "user_id": f"eq.{user_id}",
            "status": "eq.active",
            "select": "recipe_id",
        },
    )
    owned_ids = {row["recipe_id"] for row in owned}
    offerings = supa.select(
        "recipe_offerings",
        params={
            "is_free": "eq.false",
            "content_key": "not.is.null",
            "select": "*",
            "order": "created_at.asc",
            "limit": "400",
        },
    )
    for off in offerings:
        if off["recipe_id"] not in owned_ids:
            recipes = supa.select(
                "recipes",
                params={"id": f"eq.{off['recipe_id']}", "select": "id,slug"},
            )
            if recipes:
                return recipes[0], off
    return None


def access_state(supa: Supa, user_id: str, recipe_id: str, offering: dict) -> str:
    """Mirror of access_service.py: free | owned | locked."""
    if offering.get("is_free"):
        return "free"
    ents = supa.select(
        "entitlements",
        params={
            "user_id": f"eq.{user_id}",
            "recipe_id": f"eq.{recipe_id}",
            "status": "eq.active",
            "select": "id",
        },
    )
    return "owned" if ents else "locked"


def active_mandate(supa: Supa, user_id: str) -> dict | None:
    rows = supa.select(
        "spend_mandates",
        params={
            "user_id": f"eq.{user_id}",
            "status": "eq.active",
            "select": "*",
            "order": "granted_at.desc",
        },
    )
    return rows[0] if rows else None


# ----------------------------------------------------------------------------- flow


def run_demo(supa: Supa, user_email: str, recipe_slug: str, ceiling: int) -> None:
    banner("SETUP — resolve the real user, recipe and offering")
    user = resolve_user(supa, user_email)
    if recipe_slug:
        recipe, offering = resolve_offering(supa, recipe_slug)
    else:
        picked = pick_locked_offering(supa, user["id"])
        if not picked:
            warn("Could not find a locked recipe for this user; falling back to default.")
            recipe, offering = resolve_offering(supa, "6-hour-slow-roasted-pork-shoulder")
        else:
            recipe, offering = picked
            step(f"Auto-picked a recipe this user does NOT own yet: {recipe['slug']}")
    content_key = offering.get("content_key")
    price = offering.get("price_amount") or 0
    currency = offering.get("currency_code") or "USD"
    step(f"User       : {user.get('display_name') or user['id']}  ({user['id']})")
    step(f"Recipe     : {recipe['slug']}  ({recipe['id']})")
    step(f"Offering    : content_key={content_key}  price={money(price, currency)}")

    before = access_state(supa, user["id"], recipe["id"], offering)
    step(f"Access BEFORE: \033[1m{before}\033[0m")
    if before == "owned":
        warn(
            "User already owns this recipe. Run with --cleanup first, or pick another --recipe, "
            "to see the locked -> owned transition cleanly."
        )

    banner("1 — AUTHORIZE: create an AP2-style session spend mandate")
    mandate = active_mandate(supa, user["id"])
    if mandate and (mandate.get("metadata") or {}).get("spike"):
        step(f"Reusing existing spike mandate {mandate['id']}")
    else:
        mandate = supa.insert(
            "spend_mandates",
            {
                "user_id": user["id"],
                "session_id": f"{SPIKE_TAG}-{uuid.uuid4().hex[:8]}",
                "ceiling_amount": ceiling,
                "currency_code": currency,
                "consumed_amount": 0,
                "status": "active",
                "source": "voice",
                "expires_at": None,
                "metadata": {"spike": True, "note": "agentic tab payments spike"},
            },
        )
        ok(
            f"Mandate granted: up to {money(ceiling, currency)} this session "
            f"(id={mandate['id']})"
        )

    banner("2 — GATE: does the charge fit under the mandate ceiling?")
    remaining = mandate["ceiling_amount"] - mandate["consumed_amount"]
    step(f"Remaining headroom: {money(remaining, currency)}; price: {money(price, currency)}")
    if price > remaining:
        warn(
            "Charge exceeds the mandate ceiling -> the agent must re-ask the user. "
            "Stopping silent flow (this is the correct guardrail)."
        )
        return
    ok("Within ceiling -> the agent may charge silently. No user prompt needed.")

    banner("3 — RECONCILE: process a verified Supertab `purchase.completed` webhook")
    event_id = f"{SPIKE_TAG}-{uuid.uuid4().hex}"
    provider_purchase_id = f"{SPIKE_TAG}-{uuid.uuid4().hex[:12]}"
    webhook_payload = {
        "type": "purchase.completed",
        "version": "2025-04-01",
        "data": {
            "purchase": {
                "id": provider_purchase_id,
                "status": "completed",
                "purchased_at": _now_iso(),
                "completed_at": _now_iso(),
                "price": {"amount": price, "currency": {"code": currency}},
                "metadata": {
                    "content_key": content_key,
                    "recipe_id": recipe["id"],
                    "jamie_user_id": user["id"],
                    "source": "agent-silent-tab",
                },
                "entitlement_status": {
                    "content_key": content_key,
                    "has_entitlement": True,
                    "expires": None,
                },
            }
        },
    }
    step("Inbound webhook event (Svix-signed in production; signature verify is the prod gate):")
    print(json.dumps(webhook_payload, indent=2))

    processed = _process_webhook(
        supa, event_id, webhook_payload, user, recipe, offering, mandate
    )
    if processed:
        ok("Webhook processed: purchase + entitlement written, mandate decremented.")
    else:
        warn("Webhook already processed before (idempotent skip).")

    banner("4 — ACCESS: re-check recipe access (mirrors access_service.py)")
    after = access_state(supa, user["id"], recipe["id"], offering)
    arrow = "\033[32m→ owned ✓\033[0m" if after == "owned" else f"→ {after}"
    step(f"Access AFTER : \033[1m{after}\033[0m   ({before} {arrow})")
    m2 = active_mandate(supa, user["id"]) or mandate
    step(
        f"Mandate now  : consumed {money(m2.get('consumed_amount'), currency)} / "
        f"{money(m2.get('ceiling_amount'), currency)}  status={m2.get('status')}"
    )

    banner("5 — IDEMPOTENCY: replay the exact same webhook event")
    replay = _process_webhook(
        supa, event_id, webhook_payload, user, recipe, offering, m2
    )
    if replay:
        warn("Replay caused a second write — idempotency FAILED.")
    else:
        ok("Replay was a no-op — no double-charge, no double-grant. Idempotency holds.")

    print(
        "\n\033[1;32mResult: a verified server-side event drove a locked → owned unlock "
        "with no payment UI and no client trust.\033[0m"
    )
    print("Run with --cleanup to remove everything this spike created.\n")


def _process_webhook(supa, event_id, payload, user, recipe, offering, mandate) -> bool:
    """Idempotently apply a webhook. Returns True if it did work, False if duplicate."""
    # Idempotency guard on unique(provider, event_id): check-then-insert.
    already = supa.select(
        "webhook_events",
        params={
            "provider": "eq.supertab",
            "event_id": f"eq.{event_id}",
            "select": "id",
        },
    )
    if already:
        return False  # already processed
    supa.insert(
        "webhook_events",
        {
            "provider": "supertab",
            "event_id": event_id,
            "event_type": payload["type"],
            "payload": payload,
        },
    )

    purchase_obj = payload["data"]["purchase"]
    price = purchase_obj["price"]["amount"]
    currency = purchase_obj["price"]["currency"]["code"]

    # Resolve offering by content_key from the event metadata (provider is source of truth).
    content_key = purchase_obj["metadata"]["content_key"]
    offerings = supa.select(
        "recipe_offerings",
        params={"content_key": f"eq.{content_key}", "select": "*"},
    )
    target_offering = offerings[0] if offerings else offering

    purchase = supa.insert(
        "purchases",
        {
            "user_id": user["id"],
            "recipe_offering_id": target_offering["id"],
            "provider": "supertab",
            "provider_purchase_id": purchase_obj["id"],
            "status": "completed",
            "price_amount": price,
            "currency_code": currency,
            "purchased_at": purchase_obj["purchased_at"],
            "completed_at": purchase_obj["completed_at"],
            "provider_payload": purchase_obj,
            "metadata": {"spike": True, "via": "webhook-reconcile"},
        },
    )

    existing = supa.select(
        "entitlements",
        params={
            "user_id": f"eq.{user['id']}",
            "provider_content_key": f"eq.{content_key}",
            "status": "eq.active",
            "select": "id",
        },
    )
    if not existing:
        supa.insert(
            "entitlements",
            {
                "user_id": user["id"],
                "recipe_id": recipe["id"],
                "purchase_id": purchase["id"],
                "provider": "supertab",
                "provider_content_key": content_key,
                "status": "active",
                "granted_at": _now_iso(),
            },
        )

    new_consumed = mandate["consumed_amount"] + price
    new_status = "exhausted" if new_consumed >= mandate["ceiling_amount"] else "active"
    supa.update(
        "spend_mandates",
        {"consumed_amount": new_consumed, "status": new_status, "updated_at": _now_iso()},
        params={"id": f"eq.{mandate['id']}"},
    )

    supa.update(
        "webhook_events",
        {"processed_at": _now_iso()},
        params={"event_id": f"eq.{event_id}"},
    )
    return True


def cleanup(supa: Supa) -> None:
    banner("CLEANUP — removing all rows created by this spike")
    # entitlements linked to spike purchases
    spike_purchases = supa.select(
        "purchases",
        params={"provider_purchase_id": f"like.{SPIKE_TAG}*", "select": "id"},
    )
    for p in spike_purchases:
        supa.delete("entitlements", params={"purchase_id": f"eq.{p['id']}"})
    n_ent = len(spike_purchases)
    n_pur = len(
        supa.delete(
            "purchases", params={"provider_purchase_id": f"like.{SPIKE_TAG}*"}
        )
        or []
    )
    n_wh = len(
        supa.delete("webhook_events", params={"event_id": f"like.{SPIKE_TAG}*"}) or []
    )
    n_mand = len(
        supa.delete("spend_mandates", params={"session_id": f"like.{SPIKE_TAG}*"})
        or []
    )
    ok(f"Deleted: entitlements(for {n_ent} purchases), purchases={n_pur}, "
       f"webhook_events={n_wh}, spend_mandates={n_mand}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Agentic Tab Payments — reconcile + mandate spike")
    parser.add_argument("--user", default="anibal@neuforce.ai", help="user email / display_name / uuid")
    parser.add_argument("--recipe", default=None, help="recipe slug (default: auto-pick one the user does not own)")
    parser.add_argument("--ceiling", type=int, default=1000, help="mandate ceiling in minor units (cents)")
    parser.add_argument("--cleanup", action="store_true", help="delete everything this spike created")
    args = parser.parse_args()

    base_url, key = _load_env()
    supa = Supa(base_url, key)

    if args.cleanup:
        cleanup(supa)
        return
    run_demo(supa, args.user, args.recipe, args.ceiling)


if __name__ == "__main__":
    main()
