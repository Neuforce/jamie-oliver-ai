"""
Scale recipe servings in the session payload (structured ingredients + recipe.servings).

Pure data layer: no network, no ccai. Used by scale_recipe tool and unit tests.
"""

from __future__ import annotations

from fractions import Fraction
from typing import Any, Dict, List, Optional

# Some ingredients don't scale linearly (seasonings, leaveners, etc.)
NON_LINEAR_SCALING: Dict[str, float] = {
    "salt": 0.75,
    "pepper": 0.75,
    "spices": 0.8,
    "baking powder": 0.85,
    "baking soda": 0.85,
    "yeast": 0.9,
    "vanilla": 0.8,
    "garlic": 0.85,
    "herbs": 0.8,
}


def parse_quantity(quantity_str: str) -> float:
    """Parse a quantity string into a float, handling fractions."""
    if not quantity_str:
        return 0.0

    quantity_str = quantity_str.strip()
    parts = quantity_str.split()
    total = 0.0

    for part in parts:
        try:
            if "/" in part:
                total += float(Fraction(part))
            else:
                total += float(part)
        except (ValueError, ZeroDivisionError):
            continue

    return total


def format_quantity(value: float) -> str:
    """Format a quantity nicely, using fractions where appropriate."""
    if value == 0:
        return "0"

    fractions = {
        0.125: "1/8",
        0.25: "1/4",
        0.333: "1/3",
        0.375: "3/8",
        0.5: "1/2",
        0.625: "5/8",
        0.666: "2/3",
        0.75: "3/4",
        0.875: "7/8",
    }

    whole = int(value)
    frac = value - whole

    closest_frac = ""
    min_diff = 0.1
    for f_val, f_str in fractions.items():
        if abs(frac - f_val) < min_diff:
            min_diff = abs(frac - f_val)
            closest_frac = f_str

    if whole > 0 and closest_frac:
        return f"{whole} {closest_frac}"
    if closest_frac:
        return closest_frac
    if whole > 0:
        return str(whole)
    return f"{value:.1f}".rstrip("0").rstrip(".")


def normalize_stored_quantity(scaled_qty: float) -> float | int:
    """Store scaled amounts as int when whole, else float (JSON-friendly for TTS/UX)."""
    rounded = round(float(scaled_qty), 8)
    if abs(rounded - int(rounded)) < 1e-6:
        return int(round(rounded))
    return float(round(rounded, 4))


def _coerce_original_servings(raw: Any) -> int:
    if isinstance(raw, int):
        return raw
    if isinstance(raw, str):
        if "-" in raw:
            return int(raw.split("-")[0])
        try:
            return int(raw)
        except ValueError:
            return 4
    return 4


def scale_recipe_payload_in_place(payload: Dict[str, Any], target_servings: int) -> tuple[str, bool]:
    """
    Mutate payload["ingredients"] quantities and payload["recipe"]["servings"].

    Returns (user-facing message, mutated) where mutated is True only when
    the payload was updated for a successful scale.
    """
    if target_servings <= 0:
        return "[ERROR] Please specify a positive number of servings.", False

    recipe_data = payload.get("recipe") or {}
    original_servings = _coerce_original_servings(recipe_data.get("servings", 4))
    scale_factor = target_servings / original_servings

    ingredients = payload.get("ingredients", [])
    if not ingredients:
        return "[INFO] No ingredients found to scale.", False

    lines: List[str] = [
        f"Scaling recipe from {original_servings} to {target_servings} servings",
        f"(Scale factor: {scale_factor:.2f}x)",
        "",
        "Scaled ingredients:",
    ]

    for ing in ingredients:
        if isinstance(ing, dict):
            name = ing.get("name", "")
            quantity = ing.get("quantity", "")
            unit = ing.get("unit", "")

            if quantity:
                original_qty = parse_quantity(str(quantity))
                actual_scale = scale_factor
                name_lower = name.lower()
                for key, factor in NON_LINEAR_SCALING.items():
                    if key in name_lower:
                        actual_scale = 1 + (scale_factor - 1) * factor
                        break

                scaled_qty = original_qty * actual_scale
                formatted_qty = format_quantity(scaled_qty)
                ing["quantity"] = normalize_stored_quantity(scaled_qty)

                if unit:
                    lines.append(f"  - {formatted_qty} {unit} {name}")
                else:
                    lines.append(f"  - {formatted_qty} {name}")
            else:
                lines.append(f"  - {name} (adjust to taste)")
        elif isinstance(ing, str):
            lines.append(f"  - {ing}")

    lines.append("")
    lines.append(
        "Ingredient amounts in this cooking session now match this scale "
        "(voice hints will use these quantities)."
    )
    lines.append("")
    lines.append("Note: Cooking times generally stay the same, but keep an eye on things!")
    if scale_factor > 1.5:
        lines.append("Tip: You may need to cook in batches or use larger cookware.")
    elif scale_factor < 0.75:
        lines.append("Tip: Reduce cooking time slightly and watch for doneness.")

    recipe_data["servings"] = target_servings
    payload["recipe"] = recipe_data

    return "\n".join(lines), True
