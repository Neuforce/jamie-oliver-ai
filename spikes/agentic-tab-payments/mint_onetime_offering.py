#!/usr/bin/env python3
"""
Spike 3 - Merchant API: mint a One-Time Offering server-to-server.

Validates the one PRD step that is NOT yet runnable with our current credentials:
the backend minting a priced, metadata-tagged offer that an agent/client can then
purchase via the Customer API. This is the agentic equivalent of a "payment intent".

Flow:
  1. Exchange MAPI client_id + client_secret for an OAuth2 token (client_credentials).
  2. POST /mapi/onetime_offerings with a content_key in metadata + a priced item.
  3. Print the onetime_offering id + status (`new`) -> hand that id to Spike 1's
     api.purchase({ onetimeOfferingId }) to complete a fully headless, modal-free unlock.

REQUIRED CREDENTIALS (not present in the repo today):
  Create an API key in the Supertab Business Portal -> API Keys, then set:
    export SUPERTAB_MAPI_CLIENT_ID=...        # from the API Keys list
    export SUPERTAB_MAPI_CLIENT_SECRET=...    # shown once on creation
  The client id used for the x-supertab-client-id header defaults to the existing
  frontend test client; override with SUPERTAB_CLIENT_ID if needed.

Usage:
  python3 mint_onetime_offering.py
  python3 mint_onetime_offering.py --content-key "recipe:a-basic-risotto-recipe:cook" \
      --price 199 --currency USD --description "Cook with Jamie: Basic risotto"
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

MERCHANT_TOKEN_URL = "https://merchant-auth.supertab.co/oauth2/token"
MAPI_BASE = "https://tapi.supertab.co/mapi"
API_VERSION = "2025-04-01"
DEFAULT_CLIENT_ID = "test_client.4764f49f-00fa-49be-a628-6b4a46005afd"


def _load_dotenv() -> None:
    """Populate os.environ from a sibling .env file (without overriding real env vars)."""
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())


def _post(url: str, *, headers: dict, data: bytes):
    req = urllib.request.Request(url, data=data, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode() or "{}")


def get_token(client_id: str, client_secret: str) -> str:
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    status, body = _post(
        MERCHANT_TOKEN_URL,
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data=urllib.parse.urlencode(
            {"grant_type": "client_credentials", "scope": "mapi:read mapi:write"}
        ).encode(),
    )
    if status != 200 or "access_token" not in body:
        sys.exit(f"Token request failed ({status}): {json.dumps(body, indent=2)}")
    print(f"\033[32m✓ Obtained MAPI token (expires_in={body.get('expires_in')}s)\033[0m")
    return body["access_token"]


def create_onetime_offering(token, supertab_client_id, content_key, price, currency, description):
    payload = {
        "currency_code": currency,
        "metadata": {"content_key": content_key, "source": "agentic-tab-payments-spike"},
        "items": [
            {
                "price_amount": price,
                "description": description,
                "metadata": {"content_key": content_key},
            }
        ],
    }
    print("\n\033[36m▶ POST /mapi/onetime_offerings\033[0m")
    print(json.dumps(payload, indent=2))
    status, body = _post(
        f"{MAPI_BASE}/onetime_offerings",
        headers={
            "Authorization": f"Bearer {token}",
            "x-supertab-client-id": supertab_client_id,
            "x-api-version": API_VERSION,
            "Content-Type": "application/json",
        },
        data=json.dumps(payload).encode(),
    )
    print(f"\n\033[36m▶ Response ({status})\033[0m")
    print(json.dumps(body, indent=2))
    if status == 201:
        offering_id = body.get("id")
        print(
            f"\n\033[1;32m✓ One-time offering minted: {offering_id} (status={body.get('status')})\033[0m"
        )
        print(
            "Next: in Spike 1, call api.purchase({ onetimeOfferingId: '"
            f"{offering_id}', currencyCode: '{currency}' }}) to complete a "
            "fully headless, modal-free unlock."
        )
    else:
        print("\n\033[33m! Offering not created — see the error body above.\033[0m")


def main() -> None:
    parser = argparse.ArgumentParser(description="Mint a Supertab one-time offering (Merchant API)")
    parser.add_argument("--content-key", default="recipe:a-basic-risotto-recipe:cook")
    parser.add_argument("--price", type=int, default=199, help="minor units (cents)")
    parser.add_argument("--currency", default="USD")
    parser.add_argument("--description", default="Cook with Jamie: Basic risotto")
    args = parser.parse_args()

    _load_dotenv()
    client_id = os.environ.get("SUPERTAB_MAPI_CLIENT_ID")
    client_secret = os.environ.get("SUPERTAB_MAPI_CLIENT_SECRET")
    # The bearer token is tied to the MAPI client, so the x-supertab-client-id header
    # must be consistent with it; default the header to the MAPI client id.
    supertab_client_id = os.environ.get("SUPERTAB_CLIENT_ID", client_id or DEFAULT_CLIENT_ID)

    if not (client_id and client_secret):
        print(
            "\033[33mMissing Merchant API credentials.\033[0m\n"
            "This is the ONE blocker the spike set surfaces: we have a Customer/test client\n"
            "id but no Merchant API key. To run this spike:\n\n"
            "  1. Supertab Business Portal -> API Keys -> Create API Key\n"
            "  2. export SUPERTAB_MAPI_CLIENT_ID=...\n"
            "  3. export SUPERTAB_MAPI_CLIENT_SECRET=...   (shown once)\n"
            "  4. re-run: python3 mint_onetime_offering.py\n\n"
            "Until then, Spike 1 can still validate modal-free charging against the\n"
            "site's PRE-DEFINED offerings (which need no Merchant API call)."
        )
        sys.exit(2)

    token = get_token(client_id, client_secret)
    create_onetime_offering(
        token, supertab_client_id, args.content_key, args.price, args.currency, args.description
    )


if __name__ == "__main__":
    main()
