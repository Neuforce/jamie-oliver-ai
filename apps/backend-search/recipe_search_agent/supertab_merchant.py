"""Supertab Merchant API client for minting one-time offerings."""

from __future__ import annotations

import base64
import os
import time
from typing import Any, Optional

import httpx

MERCHANT_TOKEN_URL = "https://merchant-auth.supertab.co/oauth2/token"
MAPI_BASE = "https://tapi.supertab.co/mapi"
API_VERSION = "2025-04-01"


class SupertabMerchantClient:
    """OAuth2 client-credentials client for Supertab Merchant API."""

    def __init__(
        self,
        *,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        supertab_client_id: Optional[str] = None,
    ):
        self._client_id = client_id or os.getenv("SUPERTAB_MAPI_CLIENT_ID")
        self._client_secret = client_secret or os.getenv("SUPERTAB_MAPI_CLIENT_SECRET")
        # MAPI bearer is tied to the MAPI client id — prefer it for x-supertab-client-id.
        self._supertab_client_id = (
            supertab_client_id
            or self._client_id
            or os.getenv("SUPERTAB_CLIENT_ID")
        )
        self._token: Optional[str] = None
        self._token_expires_at: float = 0.0

    def _ensure_credentials(self) -> None:
        if not (self._client_id and self._client_secret):
            raise RuntimeError(
                "SUPERTAB_MAPI_CLIENT_ID and SUPERTAB_MAPI_CLIENT_SECRET must be configured"
            )

    def _get_token(self) -> str:
        self._ensure_credentials()
        if self._token and time.time() < self._token_expires_at - 30:
            return self._token

        basic = base64.b64encode(f"{self._client_id}:{self._client_secret}".encode()).decode()
        with httpx.Client(timeout=15.0) as client:
            response = client.post(
                MERCHANT_TOKEN_URL,
                headers={
                    "Authorization": f"Basic {basic}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={
                    "grant_type": "client_credentials",
                    "scope": "mapi:read mapi:write",
                },
            )
            response.raise_for_status()
            body = response.json()

        self._token = body["access_token"]
        self._token_expires_at = time.time() + float(body.get("expires_in", 3600))
        return self._token

    def create_onetime_offering(
        self,
        *,
        content_key: str,
        price_amount: int,
        currency_code: str = "USD",
        description: str,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        token = self._get_token()
        payload = {
            "currency_code": currency_code,
            "metadata": {
                "content_key": content_key,
                "source": "jamie-agentic-commerce",
                **(metadata or {}),
            },
            "items": [
                {
                    "price_amount": price_amount,
                    "description": description,
                    "metadata": {"content_key": content_key},
                }
            ],
        }
        with httpx.Client(timeout=15.0) as client:
            response = client.post(
                f"{MAPI_BASE}/onetime_offerings",
                headers={
                    "Authorization": f"Bearer {token}",
                    "x-supertab-client-id": self._supertab_client_id or "",
                    "x-api-version": API_VERSION,
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            return response.json()
