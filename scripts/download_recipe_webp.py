#!/usr/bin/env python3
"""
Download missing hero images into apps/frontend/public/recipes-img.

Reads data/recipes/*.json, uses recipe.images[0] (Jamie Oliver CDN; URLs already request
fm=webp). Output basenames must match getImagePath() in
apps/frontend/src/data/recipeLoader.ts — keep IMAGE_MAP identical when you change it there.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Keep in sync with recipeLoader.ts getImagePath → imageMap
IMAGE_MAP: dict[str, str] = {
    "christmas-salad-jamie-oliver-recipes": "christmas-salad",
    "christmas-salad": "christmas-salad",
    "happy-fish-pie": "happy-fish-pie",
    "smoked-salmon-pasta-jamie-oliver-recipes": "smoked-salmon-pasta",
    "smoked-salmon-pasta": "smoked-salmon-pasta",
    "somali-beef-stew-jamie-oliver-recipes": "somali-beef-stew",
    "somali-beef-stew": "somali-beef-stew",
    "tomato-mussel-pasta": "tomato-mussel-pasta",
    "greek-salad": "greek-salad",
    "fish-and-chips": "easy-fish-and-chips",
    "thai-green-curry": "thai-green-curry",
    "shrimp-scampi": "shrimp-scampi",
    "pad-thai": "pad-thai",
    "grilled-salmon-with-lemon": "grilled-salmon",
    "chicken-tikka-masala": "chicken-tikka-masala",
    "chicken-noodle-soup": "chicken-noodle-soup",
    "chicken-caesar-salad": "chicken-caesar-salad",
    "roast-chicken-dinner": "roast-chicken-dinner",
    "pesto-pasta": "pesto-pasta",
    "beef-wellington": "beef-wellington",
    "beef-tacos": "beef-tacos",
    "beef-kebabs": "beef-kebabs",
    "classic-spaghetti-carbonara": "classic-spaghetti-carbonara",
    "classic-lasagna": "classic-lasagna",
    "classic-apple-pie": "classic-apple-pie",
    "french-onion-soup": "french-onion-soup",
    "fresh-tomato-soup": "fresh-tomato-soup",
    "french-toast": "french-toast",
    "full-english-breakfast": "english-breakfast",
    "eggs-benedict": "eggs-benedict",
    "mushroom-risotto": "mushroom-risotto",
    "moussaka": "moussaka",
    "quinoa-salad": "quinoa-salad",
    "shepherds-pie": "shepherd-s-pie",
    "steak-and-fries": "steak-and-fries",
    "tiramisu": "tiramisu",
    "vegetable-curry": "vegetable-curry",
}

UA = "Mozilla/5.0 (compatible; neuForce-jamie-oliver-ai/1.0)"


def expected_base(recipe_id: str) -> str:
    n = re.sub(r"-jamie-oliver-recipes$", "", recipe_id or "", flags=re.I).lower()
    return IMAGE_MAP.get(recipe_id) or IMAGE_MAP.get(n) or n


def download(url: str, dest: Path, timeout: int) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = resp.read()
        ct = (resp.headers.get("Content-Type") or "").lower()
        if "webp" not in ct and not data[:12].startswith(b"RIFF"):
            # CDN usually returns image/webp; warn if suspicious
            print(f"  warning: unexpected Content-Type {ct!r} for {dest.name}", file=sys.stderr)
    dest.write_bytes(data)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--data-dir",
        type=Path,
        default=ROOT / "data" / "recipes",
        help="Directory with recipe JSON files",
    )
    ap.add_argument(
        "--out-dir",
        type=Path,
        default=ROOT / "apps" / "frontend" / "public" / "recipes-img",
        help="Where to write *.webp",
    )
    ap.add_argument("--dry-run", action="store_true", help="Print actions only")
    ap.add_argument("--delay", type=float, default=0.15, help="Seconds between requests")
    ap.add_argument("--timeout", type=int, default=60)
    args = ap.parse_args()

    data_dir: Path = args.data_dir
    out_dir: Path = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    planned: list[tuple[Path, str, str]] = []
    for jf in sorted(data_dir.glob("*.json")):
        try:
            payload = json.loads(jf.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            print(f"skip {jf.name}: {e}", file=sys.stderr)
            continue
        recipe = payload.get("recipe") or {}
        rid = recipe.get("id")
        if not rid:
            continue
        imgs = recipe.get("images") or []
        if not imgs or not isinstance(imgs, list):
            continue
        url = imgs[0]
        if not url or not isinstance(url, str):
            continue
        base = expected_base(rid)
        dest = out_dir / f"{base}.webp"
        if dest.is_file():
            continue
        planned.append((dest, url, jf.name))

    print(f"Missing WebP files to fetch: {len(planned)}")
    if args.dry_run:
        for dest, url, src in planned:
            print(f"  would write {dest.name} <- {src}")
        return 0

    failed: list[tuple[str, str]] = []
    ok = 0
    for i, (dest, url, src) in enumerate(planned):
        try:
            print(f"[{i + 1}/{len(planned)}] {dest.name} ({src})")
            download(url, dest, args.timeout)
            ok += 1
        except (urllib.error.HTTPError, urllib.error.URLError, OSError, TimeoutError) as e:
            failed.append((dest.name, str(e)))
            print(f"  FAIL {dest.name}: {e}", file=sys.stderr)
        if args.delay > 0 and i + 1 < len(planned):
            time.sleep(args.delay)

    print(f"Done: {ok} saved, {len(failed)} failed")
    if failed:
        for name, err in failed:
            print(f"  {name}: {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
