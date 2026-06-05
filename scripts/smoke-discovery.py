#!/usr/bin/env python3
"""
Smoke tests for discovery chat + published recipe catalog.

Usage:
  python scripts/smoke-discovery.py [--base-url http://localhost:8000] [--save baseline.json]

Requires backend-search running with valid Supabase + OPENAI_API_KEY for SSE chat cases.
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from dataclasses import dataclass, field
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass
class CaseResult:
    name: str
    passed: bool
    detail: str = ""
    data: dict[str, Any] = field(default_factory=dict)


def _get(url: str, timeout: float = 30.0) -> tuple[int, Any]:
    req = Request(url, headers={"Accept": "application/json"})
    try:
        with urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else None
    except HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {"detail": body}
        return exc.code, payload


def _post_sse(base_url: str, message: str, session_id: str) -> list[dict[str, Any]]:
    import urllib.request

    payload = json.dumps({"message": message, "session_id": session_id}).encode("utf-8")
    req = Request(
        f"{base_url}/api/v1/chat",
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
        method="POST",
    )
    events: list[dict[str, Any]] = []
    with urllib.request.urlopen(req, timeout=120) as resp:
        buffer = ""
        while True:
            chunk = resp.read(4096)
            if not chunk:
                break
            buffer += chunk.decode("utf-8")
            while "\n\n" in buffer:
                block, buffer = buffer.split("\n\n", 1)
                for line in block.splitlines():
                    if line.startswith("data: "):
                        raw = line[6:].strip()
                        if raw:
                            events.append(json.loads(raw))
    return events


def check_health(base_url: str) -> CaseResult:
    try:
        status, body = _get(f"{base_url}/health")
        ok = status == 200 and isinstance(body, dict) and body.get("status") == "healthy"
        return CaseResult("health", ok, detail=str(body))
    except (URLError, TimeoutError) as exc:
        return CaseResult("health", False, detail=str(exc))


def check_catalog_list(base_url: str) -> CaseResult:
    status, body = _get(f"{base_url}/api/v1/recipes?limit=500&status=published")
    recipes = body.get("recipes", []) if isinstance(body, dict) else []
    slugs = [r.get("recipe_id") for r in recipes if r.get("recipe_id")]
    ok = status == 200 and len(slugs) > 0
    return CaseResult(
        "catalog_list",
        ok,
        detail=f"{len(slugs)} published slugs",
        data={"slugs": slugs[:20], "total": len(slugs)},
    )


def check_catalog_slug(base_url: str, slug: str, expect_status: int) -> CaseResult:
    status, body = _get(f"{base_url}/api/v1/recipes/{slug}")
    ok = status == expect_status
    return CaseResult(
        f"catalog_get_{slug}",
        ok,
        detail=f"HTTP {status} (expected {expect_status})",
        data={"body": body},
    )


def check_sse_search(base_url: str, query: str, published_slugs: set[str]) -> CaseResult:
    session_id = f"smoke-{uuid.uuid4()}"
    try:
        events = _post_sse(base_url, query, session_id)
    except Exception as exc:
        return CaseResult(f"sse_{query}", False, detail=str(exc))

    types = [e.get("type") for e in events]
    has_tool = "tool_call" in types
    has_done = "done" in types
    recipe_events = [e for e in events if e.get("type") == "recipes"]
    slugs: list[str] = []
    tool_call_ids: list[str] = []
    response_ids: list[str] = []

    for event in events:
        meta = event.get("metadata") or {}
        if event.get("type") == "tool_call" and meta.get("tool_call_id"):
            tool_call_ids.append(meta["tool_call_id"])
        if meta.get("response_id"):
            response_ids.append(meta["response_id"])
        if event.get("type") == "recipes":
            for recipe in meta.get("recipes") or []:
                rid = recipe.get("recipe_id")
                if rid:
                    slugs.append(rid)

    unknown = [s for s in slugs if s not in published_slugs]
    structured_have_tool_id = all(
        (e.get("metadata") or {}).get("tool_call_id")
        for e in recipe_events
    ) if recipe_events else True

    ok = has_tool and has_done and not unknown and structured_have_tool_id
    detail = (
        f"events={len(events)} slugs={slugs[:5]} unknown={unknown} "
        f"tool_call_ids={len(tool_call_ids)} response_ids={len(set(response_ids))}"
    )
    return CaseResult(
        f"sse_{query.replace(' ', '_')}",
        ok,
        detail=detail,
        data={"events": events, "slugs": slugs},
    )


def run_smoke(base_url: str) -> dict[str, Any]:
    results: list[CaseResult] = []
    results.append(check_health(base_url))

    catalog = check_catalog_list(base_url)
    results.append(catalog)
    published = set()
    if catalog.passed:
        status, body = _get(f"{base_url}/api/v1/recipes?limit=500&status=published")
        if status == 200 and isinstance(body, dict):
            published = {r["recipe_id"] for r in body.get("recipes", []) if r.get("recipe_id")}

    if published:
        sample = next(iter(published))
        results.append(check_catalog_slug(base_url, sample, 200))
    results.append(check_catalog_slug(base_url, "fish-tacos", 404))

    if published:
        results.append(check_sse_search(base_url, "find me easy pasta recipes", published))

    report = {
        "base_url": base_url,
        "passed": all(r.passed for r in results),
        "results": [
            {"name": r.name, "passed": r.passed, "detail": r.detail, "data": r.data}
            for r in results
        ],
    }
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Discovery smoke tests")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--save", help="Write JSON report to this path")
    args = parser.parse_args()

    report = run_smoke(args.base_url.rstrip("/"))
    if args.save:
        with open(args.save, "w", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2)
        print(f"Wrote report to {args.save}")

    for item in report["results"]:
        status = "PASS" if item["passed"] else "FAIL"
        print(f"[{status}] {item['name']}: {item['detail']}")

    print(f"\nOverall: {'PASS' if report['passed'] else 'FAIL'}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
