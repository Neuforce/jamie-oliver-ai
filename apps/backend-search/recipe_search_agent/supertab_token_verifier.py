"""Verify Supertab customer tokens on backend identity/access endpoints."""

from __future__ import annotations

import os
from typing import Any, Optional

import httpx


class SupertabTokenVerifier:
    """Validate a Supertab customer access token and return the customer profile."""

    CUSTOMER_API_BASE = "https://tapi.supertab.co/capi"

    def __init__(self, *, client_id: Optional[str] = None):
        self._client_id = client_id or os.getenv("SUPERTAB_CLIENT_ID")

    def verify_token(self, access_token: str) -> dict[str, Any]:
        if not access_token:
            raise ValueError("Missing Supertab access token")
        if not self._client_id:
            raise RuntimeError("SUPERTAB_CLIENT_ID is not configured")

        with httpx.Client(timeout=10.0) as client:
            response = client.get(
                f"{self.CUSTOMER_API_BASE}/customer",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "x-supertab-client-id": self._client_id,
                },
            )
            if response.status_code == 401:
                raise ValueError("Invalid or expired Supertab token")
            response.raise_for_status()
            body = response.json()

        if not body.get("authenticated"):
            raise ValueError("Supertab customer is not authenticated")
        return body
