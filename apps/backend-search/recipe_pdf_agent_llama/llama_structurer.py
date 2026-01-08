"""Llama-driven recipe understanding and JOAv0 structuring with validation retry."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

from recipe_pdf_agent_llama.config import LlamaAgentConfig
from recipe_pdf_agent_llama.ollama_client import OllamaConfig, chat_json
from recipe_pdf_agent_llama.prompts import (
    SYSTEM_JSON_ONLY,
    block_classification_prompt,
    blocks_to_markdown_prompt,
    clean_text_prompt,
)

# Optional LangChain imports
try:
    from recipe_pdf_agent_llama.langchain_sections import detect_sections
    from recipe_pdf_agent_llama.langchain_ing_steps import parse_ingredients_block, parse_steps_block
except Exception:
    detect_sections = None  # type: ignore
    parse_ingredients_block = None  # type: ignore
    parse_steps_block = None  # type: ignore

try:
    from recipe_pdf_agent_llama.langchain_parser import parse_with_langchain_ollama
except Exception:
    parse_with_langchain_ollama = None  # type: ignore

logger = logging.getLogger(__name__)


def _split_text(raw_text: str, window: int = 200, overlap: int = 10) -> list[str]:
    """Split raw text into overlapping windows to avoid long prompts."""
    chunks: list[str] = []
    start = 0
    n = len(raw_text)
    while start < n:
        end = min(n, start + window)
        chunks.append(raw_text[start:end])
        if end == n:
            break
        start = end - overlap
        if start < 0:
            start = 0
    return chunks


def clean_text_with_llama(*, cfg: LlamaAgentConfig, raw_text: str) -> str:
    windows = _split_text(raw_text)
    cleaned_parts: list[str] = []
    for idx, chunk in enumerate(windows, 1):  # llm clean
        out = chat_json(
            cfg=OllamaConfig(base_url=cfg.ollama_base_url, model=cfg.ollama_model),
            system=SYSTEM_JSON_ONLY,
            user=clean_text_prompt(chunk),
        )
        if not isinstance(out, dict):
            continue  # skip bad window
        clean = str(out.get("clean_text", "")).strip()
        if not clean:
            continue
        cleaned_parts.append(clean)
    merged = "\n".join(cleaned_parts).strip()
    if not merged:
        return raw_text
    return merged


def detect_category_mood(clean_text: str) -> tuple[str | None, str | None]:
    """
    Heuristics to derive category and mood from the cleaned text.
    Category is a coarse dish type; mood is a loose intent/feeling.
    """
    text = clean_text.lower()

    category_map = {
        "salad": ["salad"],
        "soup": ["soup", "broth"],
        "pasta": ["pasta", "spaghetti", "penne", "fettuccine", "macaroni"],
        "seafood": ["fish", "salmon", "prawn", "shrimp", "mussel", "clam", "lobster", "crab"],
        "chicken": ["chicken"],
        "beef": ["beef", "steak", "brisket"],
        "pork": ["pork", "ribs"],
        "dessert": ["dessert", "cake", "pie", "pudding", "tart"],
        "baked": ["bake", "baked", "casserole", "lasagna"],
    }
    mood_map = {
        "quick": ["quick", "30-minute", "weeknight", "fast"],
        "easy": ["easy", "simple"],
        "comfort": ["comfort", "hearty", "cozy"],
        "healthy": ["healthy", "light"],
        "vegetarian": ["vegetarian"],
        "vegan": ["vegan"],
    }

    def pick_first(mapping: dict[str, list[str]]) -> str | None:
        for label, kws in mapping.items():
            if any(kw in text for kw in kws):
                return label
        return None

    return pick_first(category_map), pick_first(mood_map)


def infer_step_on_enter(
    *,
    cfg: LlamaAgentConfig,
    step: dict[str, Any],
) -> list[dict[str, str]]:
    """
    Infiere el mensaje on_enter para un step usando LLM o heurísticas.
    
    Args:
        cfg: Configuration with Ollama settings
        step: Step dictionary with at least 'descr' or 'instructions'
        
    Returns:
        List with on_enter action, e.g. [{"say": "..."}]
    """
    descr = step.get("descr", "")
    instructions = step.get("instructions", "")
    step_type = step.get("type", "immediate")
    
    # Use descr if available, otherwise instructions
    step_text = descr if descr else instructions
    if not step_text:
        return [{"say": "Let's continue with this step."}]
    
    # Try LLM first
    try:
        prompt = f"""Generate a short, friendly verbal instruction for a cooking assistant to say when starting this step.
Keep it conversational, clear, and under 15 words. Start with action verbs like "Let's", "Now", "Start by", "Time to".

Step description: {descr}
Step instructions: {instructions[:200]}

Return ONLY a JSON object with a "say" key containing the message. Example:
{{"say": "Let's start by prepping the vegetables."}}

No markdown, no extra text."""
        
        result = chat_json(
            cfg=OllamaConfig(
                base_url=cfg.ollama_base_url,
                model=cfg.ollama_model,
                timeout_s=15.0,
            ),
            system=SYSTEM_JSON_ONLY,
            user=prompt,
        )
        
        if isinstance(result, dict) and "say" in result:
            say_text = str(result["say"]).strip()
            if say_text:
                return [{"say": say_text}]
    except Exception as e:
        logger.debug(f"LLM inference failed for step on_enter: {e}. Using fallback.")
    
    # Fallback: generate from step text using heuristics
    step_lower = step_text.lower()
    
    # Extract key action verbs and objects - more comprehensive patterns
    action_patterns = [
        (r"^(trim|slice|chop|dice|mince|grate|peel|cut)", "Let's start by {action}."),
        (r"^(heat|warm|preheat|soak)", "Let's {action} the {object}."),
        (r"^(add|place|put|transfer)", "Now {action} the {object}."),
        (r"^(cook|simmer|boil|fry|bake|roast|grill|barbecue)", "Time to {action} the {object}."),
        (r"^(mix|combine|toss|stir|whisk|blend)", "Let's {action} everything together."),
        (r"^(serve|plate|garnish|carve|arrange)", "Time to {action} and enjoy!"),
        (r"^(drain|remove|take out)", "Let's {action} the {object}."),
        (r"^(season|salt|pepper)", "Let's {action} the {object}."),
        (r"^(reserve|set aside|keep)", "Let's {action} the {object} for later."),
    ]
    
    # Try to match patterns
    for pattern, template in action_patterns:
        match = re.search(pattern, step_lower)
        if match:
            action = match.group(1)
            # Try to extract object (next few words after action, skip common words)
            rest = step_lower[match.end():].strip()
            # Skip common words like "the", "a", "an", "some"
            words = [w for w in rest.split()[:4] if w not in ["the", "a", "an", "some", "your"]]
            object_text = " ".join(words[:3]) if words else "ingredients"
            
            # Generate message
            if "{object}" in template:
                message = template.format(action=action, object=object_text)
            else:
                message = template.format(action=action)
            
            # Capitalize first letter
            message = message[0].upper() + message[1:] if message else message
            return [{"say": message}]
    
    # Default fallback - create a more natural message
    # Extract key words (verbs and nouns)
    words = step_text.split()
    # Find first verb-like word
    verbs = ["cook", "add", "mix", "heat", "place", "serve", "prepare", "make", "blend", "toss"]
    key_word = None
    for word in words[:5]:
        if any(v in word.lower() for v in verbs):
            key_word = word
            break
    
    if key_word:
        # Extract next 2-3 words after the verb
        try:
            idx = next(i for i, w in enumerate(words) if key_word.lower() in w.lower())
            following = " ".join(words[idx:idx+4][1:])  # Skip the verb itself
            if following:
                return [{"say": f"Let's {key_word.lower()} {following.lower()}."}]
        except (StopIteration, IndexError):
            pass
    
    # Final fallback - use first few words
    words = step_text.split()[:6]
    summary = " ".join(words)
    
    return [{"say": f"Let's {summary.lower()}."}]


def add_on_enter_to_steps(
    *,
    cfg: LlamaAgentConfig,
    steps: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Agrega on_enter a todos los steps que no lo tengan.
    
    Args:
        cfg: Configuration with Ollama settings
        steps: List of step dictionaries
        
    Returns:
        List of steps with on_enter added
    """
    enriched_steps = []
    for step in steps:
        # Only add on_enter if it doesn't exist
        if "on_enter" not in step or not step.get("on_enter"):
            try:
                on_enter = infer_step_on_enter(cfg=cfg, step=step)
                step["on_enter"] = on_enter
            except Exception as e:
                logger.debug(f"Failed to infer on_enter for step {step.get('id')}: {e}")
                # Add default if inference fails
                if "on_enter" not in step:
                    step["on_enter"] = [{"say": "Let's continue with this step."}]
        enriched_steps.append(step)
    return enriched_steps


def infer_recipe_metadata(
    *,
    cfg: LlamaAgentConfig,
    joav0_doc: dict[str, Any],
) -> dict[str, Any]:
    """
    Infer tags, course, and cuisine from recipe JSON using LLM.
    
    Args:
        cfg: Configuration with Ollama settings
        joav0_doc: The recipe JSON document
        
    Returns:
        Dictionary with keys: tags (list), course (str), cuisine (str)
    """
    recipe_meta = joav0_doc.get("recipe", {})
    title = recipe_meta.get("title", "")
    description = recipe_meta.get("description", "")
    ingredients = joav0_doc.get("ingredients", [])
    steps = joav0_doc.get("steps", [])
    
    # Build context for LLM
    ingredients_text = ", ".join([ing.get("name", "") for ing in ingredients if isinstance(ing, dict)])
    steps_text = " ".join([step.get("instructions", "") for step in steps if isinstance(step, dict)])[:500]  # Limit length
    
    prompt = f"""Analyze this recipe and return ONLY a JSON object with these keys:
- tags: array of 3-8 search-friendly tags (e.g., ["pasta", "quick", "vegetarian", "italian", "weeknight"])
- course: one of "main", "salad", "soup", "appetizer", "dessert", "side", "breakfast", "lunch", "dinner", "snack"
- cuisine: one of "italian", "mexican", "mediterranean", "asian", "indian", "american", "french", "thai", "chinese", "japanese", "spanish", "greek", "middle-eastern", "international", or null if unclear

Recipe Title: {title}
Description: {description}
Ingredients: {ingredients_text}
Steps (sample): {steps_text}

Return ONLY valid JSON, no extra text. Example:
{{"tags": ["pasta", "quick", "vegetarian"], "course": "main", "cuisine": "italian"}}"""
    
    try:
        result = chat_json(
            cfg=OllamaConfig(
                base_url=cfg.ollama_base_url,
                model=cfg.ollama_model,
                timeout_s=30.0,
            ),
            system=SYSTEM_JSON_ONLY,
            user=prompt,
        )
        
        if isinstance(result, dict):
            tags = result.get("tags", [])
            course = result.get("course")
            cuisine = result.get("cuisine")
            
            # Validate and normalize
            if not isinstance(tags, list):
                tags = []
            tags = [str(tag).lower().strip() for tag in tags if tag]
            
            if course and not isinstance(course, str):
                course = None
            if course:
                course = course.lower().strip()
            
            if cuisine and not isinstance(cuisine, str):
                cuisine = None
            if cuisine:
                cuisine = cuisine.lower().strip()
            
            return {
                "tags": tags[:8],  # Limit to 8 tags max
                "course": course,
                "cuisine": cuisine,
            }
    except Exception as e:
        logger.warning(f"Failed to infer recipe metadata via LLM: {e}. Using fallback.")
    
    # Fallback: use heuristics
    clean_text = f"{title} {description} {ingredients_text}".lower()
    tags = []
    
    # Infer tags from ingredients and title
    if any(word in clean_text for word in ["pasta", "spaghetti", "penne"]):
        tags.append("pasta")
    if any(word in clean_text for word in ["chicken", "pollo"]):
        tags.append("chicken")
    if any(word in clean_text for word in ["beef", "carne"]):
        tags.append("beef")
    if any(word in clean_text for word in ["vegetarian", "veggie"]):
        tags.append("vegetarian")
    if any(word in clean_text for word in ["quick", "fast", "30-minute"]):
        tags.append("quick")
    
    # Infer course
    course = None
    if any(word in clean_text for word in ["salad"]):
        course = "salad"
    elif any(word in clean_text for word in ["soup", "broth"]):
        course = "soup"
    elif any(word in clean_text for word in ["dessert", "cake", "pie", "pudding"]):
        course = "dessert"
    else:
        course = "main"
    
    # Infer cuisine
    cuisine = None
    if any(word in clean_text for word in ["italian", "pasta", "parmesan", "risotto"]):
        cuisine = "italian"
    elif any(word in clean_text for word in ["mexican", "taco", "salsa", "cilantro"]):
        cuisine = "mexican"
    elif any(word in clean_text for word in ["thai", "curry", "coconut"]):
        cuisine = "thai"
    elif any(word in clean_text for word in ["chinese", "soy", "ginger"]):
        cuisine = "chinese"
    elif any(word in clean_text for word in ["indian", "curry", "masala"]):
        cuisine = "indian"
    
    return {
        "tags": tags[:8],
        "course": course,
        "cuisine": cuisine,
    }


def _extract_section(text: str, keywords: list[str]) -> str:
    """Best-effort section extraction by heading keywords."""
    lines = text.splitlines()
    collected = []
    capture = False
    for line in lines:
        lower = line.lower().strip()
        if any(kw in lower for kw in keywords):
            capture = True
            continue
        if capture:
            if lower == "" or re.match(r"^[A-Z][A-Za-z ]{0,20}:$", line.strip()):
                break
            collected.append(line)
    return "\n".join(collected).strip()


def _parse_meta_header(text: str) -> tuple[str | None, str | None, int | None]:
    """Extract estimated_total (ISO-8601), difficulty, servings from header-like text."""
    estimated_total = None
    difficulty = None
    servings = None

    # time like '20 MINS' -> PT20M; '1 HOUR' -> PT1H; '1 HR 5 MINS' -> PT1H5M
    import re
    time_match = re.search(r"(\d+)\s*(HOURS|HOUR|HRS|HR)", text, re.IGNORECASE)
    mins_match = re.search(r"(\d+)\s*(MINUTES|MINUTE|MINS|MIN)", text, re.IGNORECASE)
    hours = time_match.group(1) if time_match else None
    minutes = mins_match.group(1) if mins_match else None
    if hours or minutes:
        h = f"{int(hours)}H" if hours else ""
        m = f"{int(minutes)}M" if minutes else ""
        estimated_total = f"PT{h}{m}" if (h or m) else None

    diff_match = re.search(r"(NOT TOO TRICKY|EASY|MEDIUM|HARD|TRICKY)", text, re.IGNORECASE)
    if diff_match:
        difficulty = diff_match.group(1).title()

    serv_match = re.search(r"Serves\s+(\d+)", text, re.IGNORECASE)
    if serv_match:
        servings = int(serv_match.group(1))

    return estimated_total, difficulty, servings


UNITS = ["g", "kg", "ml", "l", "cup", "cups", "tbsp", "tsp", "oz", "lb"]


def _parse_qty_unit_name(line: str) -> tuple[float | int | None, str | None, str]:
    parts = line.split()
    qty: float | int | None = None
    unit: str | None = None
    rest = line
    if parts:
        candidate = parts[0].replace("/", "").replace(".", "")
        if candidate.isdigit():
            try:
                qty = float(parts[0]) if "." in parts[0] else int(parts[0])
            except Exception:
                qty = None
            rest = " ".join(parts[1:])
    rest_parts = rest.split()
    if rest_parts and rest_parts[0].lower().strip(",.") in UNITS:
        unit = rest_parts[0]
        rest = " ".join(rest_parts[1:])
    name = rest.strip()
    return qty, unit, name


def _parse_markdown_to_sections(markdown_text: str) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {"title": [], "meta": [], "ingredients": [], "method": [], "notes": []}
    current = None
    for raw in markdown_text.splitlines():
        line = raw.strip()
        if not line:
            continue
        header = line.lower()
        if header.startswith("#"):
            if "ingredient" in header:
                current = "ingredients"
                continue
            if "method" in header or "instruction" in header or "steps" in header:
                current = "method"
                continue
            if "note" in header:
                current = "notes"
                continue
            if "meta" in header:
                current = "meta"
                continue
            # title header
            sections["title"] = [line.lstrip("#").strip()]
            current = None
            continue
        if current == "ingredients":
            if line.startswith("-"):
                line = line.lstrip("-").strip()
            sections["ingredients"].append(line)
        elif current == "method":
            sections["method"].append(line)
        elif current == "meta":
            sections["meta"].append(line)
        elif current == "notes":
            sections["notes"].append(line)
        else:
            sections["meta"].append(line)
    return sections


def parse_markdown_to_joav0(markdown_text: str, *, recipe_id: str) -> dict[str, Any]:
    sections = _parse_markdown_to_sections(markdown_text)
    title = sections["title"][0] if sections["title"] else recipe_id.replace("-", " ").title()

    # meta
    meta_text = "\n".join(sections["meta"])
    estimated_total, difficulty, servings = _parse_meta_header(meta_text)

    # ingredients
    ingredients: list[dict[str, Any]] = []
    for line in sections["ingredients"]:
        qty, unit, name = _parse_qty_unit_name(line)
        if name:
            ingredients.append({"name": name, "quantity": qty, "unit": unit})

    # steps
    steps: list[dict[str, Any]] = []
    step_lines: list[str] = []
    for line in sections["method"]:
        m = re.match(r"^\s*\d+[.)]?\s+(.*)", line)
        if m:
            step_lines.append(m.group(1).strip())
        else:
            step_lines.append(line.strip())
    step_lines = [s for s in step_lines if s]
    if not step_lines:
        step_lines = [" ".join(sections["method"]).strip()] if sections["method"] else []
    if not step_lines:
        step_lines = [markdown_text.strip()] if markdown_text.strip() else ["See recipe"]
    for ln in step_lines:
        if ln.strip():  # Only add non-empty steps
            step_dict = {
                "id": f"step-{len(steps)+1}",
                "descr": ln.strip(),
                "instructions": ln.strip(),
                "type": "immediate",
                "auto_start": False,
                "requires_confirm": False,
            }
            # Note: on_enter will be added later in pipeline if cfg is available
            steps.append(step_dict)

    notes_text = "\n".join(sections["notes"]).strip()

    joav0 = {
        "recipe": {
            "id": recipe_id,
            "title": title,
            "estimated_total": estimated_total or "PT20M",
            "locale": "en",
            "source": "pdf",
            "servings": servings or 1,
            "difficulty": difficulty or "Unknown",
        },
        "ingredients": ingredients,
        "utensils": [],
        "steps": steps,
        "notes": {"text": notes_text or ""},
    }
    return joav0


def parse_joav0_deterministic(clean_text: str, *, recipe_id: str, source_file: str) -> dict[str, Any]:
    lines_all = [ln.rstrip() for ln in clean_text.splitlines()]
    lines = [ln.strip() for ln in lines_all if ln.strip()]
    raw_title = lines[0] if lines else recipe_id.replace("-", " ").title()
    title = raw_title.split(".")[0].strip() or raw_title

    # meta from header (before ingredients)
    text_lower = clean_text.lower()
    head_idx = text_lower.find("ingredients")
    header_text = clean_text[:head_idx] if head_idx != -1 else clean_text
    estimated_total, difficulty, servings = _parse_meta_header(header_text)

    # Parse by headings: INGREDIENTS, METHOD (robust to same-line headings)
    def push_ing(text: str, dest: list[str]) -> None:
        txt = text.strip(" :-•|").strip()
        if txt:
            dest.append(txt)

    def push_step(text: str, dest: list[str]) -> None:
        txt = text.strip(" :-•|").strip()
        if txt:
            dest.append(txt)

    mode = None
    ing_lines: list[str] = []
    step_lines: list[str] = []
    for ln in lines_all:
        ln_raw = ln.rstrip()
        ln_stripped = ln_raw.strip()
        if not ln_stripped:
            continue
        lower = ln_stripped.lower()
        ing_pos = lower.find("ingredients")
        meth_pos = lower.find("method")

        # Line contains both headings
        if ing_pos != -1 and meth_pos != -1:
            if ing_pos < meth_pos:
                # ING ... METHOD ...
                left = ln_raw[ing_pos + len("ingredients") : meth_pos]
                right = ln_raw[meth_pos + len("method") :]
                push_ing(left, ing_lines)
                push_step(right, step_lines)
            else:
                # METHOD ... INGREDIENTS ... (unlikely)
                left = ln_raw[meth_pos + len("method") : ing_pos]
                right = ln_raw[ing_pos + len("ingredients") :]
                push_step(left, step_lines)
                push_ing(right, ing_lines)
            mode = "method"
            continue

        # Single heading present
        if ing_pos != -1:
            mode = "ingredients"
            trailing = ln_raw[ing_pos + len("ingredients") :]
            push_ing(trailing, ing_lines)
            continue
        if meth_pos != -1:
            mode = "method"
            trailing = ln_raw[meth_pos + len("method") :]
            push_step(trailing, step_lines)
            continue

        # Content lines
        if mode == "ingredients":
            # If it looks like a numbered step, switch to method
            if re.match(r"^\d+[.)]?\s+", ln_stripped):
                push_step(re.sub(r"^\d+[.)]?\s*", "", ln_stripped), step_lines)
                mode = "method"
            else:
                push_ing(ln_stripped, ing_lines)
        elif mode == "method":
            push_step(ln_stripped, step_lines)

    if not ing_lines:
        ing_lines = _extract_section(clean_text, ["ingredient"]).splitlines()
    if not step_lines:
        step_lines = _extract_section(clean_text, ["method", "instruction", "directions", "steps"]).splitlines()

    notes_text = _extract_section(clean_text, ["note", "tip"])

    def _split_items(lines_block: list[str]) -> list[dict[str, Any]]:
        items = []
        for ln in lines_block:
            ln = ln.strip("-• ").strip()
            if not ln:
                continue
            lower = ln.lower()
            has_unit = any(u in lower for u in UNITS)
            starts_with_num = ln[0].isdigit()
            if not (has_unit or starts_with_num):
                continue
            qty, unit, name = _parse_qty_unit_name(ln)
            if not name:
                continue
            items.append({"name": name, "quantity": qty, "unit": unit})
        return items

    ingredients = _split_items(ing_lines)
    utensils = _split_items(_extract_section(clean_text, ["utensil", "equipment"]).splitlines())

    steps = []
    import re
    verb_kws = ["add", "mix", "whisk", "trim", "peel", "slice", "chop", "toss", "place", "serve", "separate"]

    def _is_ingredient_like(line: str) -> bool:
        tok = line.lower().strip()
        if re.match(r"^\d+[.)]?\s*$", tok):
            return True
        if re.match(r"^\d+[.)]?\s+\w+$", tok):
            return True
        if re.match(r"^\d+[.)]?\s+\w+\s+\w+$", tok) and not any(v in tok for v in verb_kws):
            return True
        return False

    method_lines = []
    for ln in step_lines:
        if _is_ingredient_like(ln):
            continue
        method_lines.append(ln)
    current = []
    for ln in method_lines:
        ln = ln.strip()
        if not ln:
            continue
        m = re.match(r"^(\d+)\s+(.*)", ln)
        if m:
            # flush current
            if current:
                step_txt = " ".join(current).strip()
                if step_txt:  # Only add non-empty steps
                    steps.append(
                        {
                            "id": f"step-{len(steps)+1}",
                            "descr": step_txt,
                            "instructions": step_txt,
                            "type": "immediate",
                            "auto_start": False,
                            "requires_confirm": False,
                        }
                    )
                current = []
            current.append(m.group(2))
        else:
            current.append(ln)
    if current:
        step_txt = " ".join(current).strip()
        if step_txt:  # Only add non-empty steps
            steps.append(
                {
                    "id": f"step-{len(steps)+1}",
                    "descr": step_txt,
                    "instructions": step_txt,
                    "type": "immediate",
                    "auto_start": False,
                    "requires_confirm": False,
                }
            )

    if not steps:
        fallback_instr = " ".join(lines[:20]) if lines else ""
        steps.append(
            {
                "id": "step-1",
                "descr": fallback_instr or "See recipe text",
                "instructions": fallback_instr or "See recipe text",
                "type": "immediate",
                "auto_start": False,
                "requires_confirm": False,
            }
        )

    joav0 = {
        "recipe": {
            "id": recipe_id,
            "title": title,
            "estimated_total": estimated_total or "PT20M",
            "locale": "en",
            "source": "pdf",
            "servings": servings or 1,
            "difficulty": difficulty or "Unknown",
        },
        "ingredients": ingredients,
        "utensils": utensils,
        "steps": steps,
        "notes": {"text": notes_text or ""},
    }
    return joav0


def _classify_blocks_with_llama(*, cfg: LlamaAgentConfig, blocks: list[dict]) -> list[dict]:
    classified: list[dict] = []
    for idx, blk in enumerate(blocks):
        order_hint = blk.get("page", 0) * 10000 + blk.get("top", 0)
        out = chat_json(
            cfg=OllamaConfig(base_url=cfg.ollama_base_url, model=cfg.ollama_model),
            system=SYSTEM_JSON_ONLY,
            user=block_classification_prompt(
                block_text=blk.get("text", ""),
                page=blk.get("page", 0),
                column=blk.get("column", "left"),
                order_hint=order_hint,
            ),
        )
        if not isinstance(out, dict):
            continue
        label = str(out.get("label", "other")).strip().lower()
        clean_txt = str(out.get("clean_text", "")).strip()
        # Heuristic: if right column and starts with a number, treat as method_step
        raw_for_hint = clean_txt or blk.get("text", "")
        if blk.get("column") == "right" and re.match(r"^\s*\d+[.)]?\s+", raw_for_hint):
            label = "method_step"
        classified.append(
            {
                "label": label,
                "clean_text": clean_txt,
                "page": blk.get("page", 0),
                "column": blk.get("column", "left"),
                "top": blk.get("top", 0),
                "order": order_hint,
            }
        )
    classified.sort(key=lambda b: (b["page"], 0 if b["column"] == "left" else 1, b["top"]))
    return classified


def _parse_blocks_to_joav0(blocks: list[dict], *, recipe_id: str, source_file: str, fallback_text: str) -> tuple[str, dict[str, Any]]:
    # Aggregate clean_text for chunking/search
    clean_text = "\n".join(b.get("clean_text", "") for b in blocks if b.get("clean_text")).strip() or fallback_text

    # Meta from header/meta labels
    estimated_total = None
    difficulty = None
    servings = None
    for b in blocks:
        if b.get("label") in {"header", "meta"} and b.get("clean_text"):
            et, diff, serv = _parse_meta_header(b["clean_text"])
            estimated_total = estimated_total or et
            difficulty = difficulty or diff
            servings = servings or serv
            if estimated_total and difficulty and servings:
                break

    # Ingredients
    ingredients: list[dict[str, Any]] = []
    for b in blocks:
        if b.get("label") != "ingredient":
            continue
        for line in b.get("clean_text", "").splitlines():
            line = line.strip()
            if not line:
                continue
            qty, unit, name = _parse_qty_unit_name(line)
            if not name:
                continue
            ingredients.append({"name": name, "quantity": qty, "unit": unit})

    # Steps
    steps: list[dict[str, Any]] = []
    step_lines: list[str] = []
    for b in blocks:
        lbl = b.get("label")
        col = b.get("column")
        txt = b.get("clean_text", "").strip()
        if not txt:
            continue
        is_numbered = re.match(r"^\s*\d+[.)]?\s+", txt) is not None
        if lbl == "method_step" or (lbl == "ingredient" and col == "right" and is_numbered):
            numbered = re.split(r"(?m)^\s*\d+[.)]\s+", txt)
            numbered = [p.strip() for p in numbered if p.strip()]
            if numbered:
                step_lines.extend(numbered)
            else:
                step_lines.append(txt)

    if not step_lines:
        # fallback: derive from non-ingredient blocks
        for b in blocks:
            if b.get("label") in {"header", "meta", "other"}:
                continue
            txt = b.get("clean_text", "").strip()
            if txt:
                step_lines.append(txt)

    for ln in step_lines:
        if ln.strip():  # Only add non-empty steps
            step_dict = {
                "id": f"step-{len(steps)+1}",
                "descr": ln.strip(),
                "instructions": ln.strip(),
                "type": "immediate",
                "auto_start": False,
                "requires_confirm": False,
            }
            # Note: on_enter will be added later in pipeline if cfg is available
            steps.append(step_dict)

    # Notes
    notes_lines = [b.get("clean_text", "") for b in blocks if b.get("label") == "note" and b.get("clean_text")]
    notes_text = "\n".join(notes_lines).strip()

    joav0 = {
        "recipe": {
            "id": recipe_id,
            "title": recipe_id.replace("-", " ").title(),
            "estimated_total": estimated_total or "PT20M",
            "locale": "en",
            "source": "pdf",
            "servings": servings or 1,
            "difficulty": difficulty or "Unknown",
        },
        "ingredients": ingredients,
        "utensils": [],
        "steps": steps or [
            {
                "id": "step-1",
                "descr": clean_text or fallback_text or "See recipe",
                "instructions": clean_text or fallback_text or "See recipe",
                "type": "immediate",
                "auto_start": False,
                "requires_confirm": False,
            }
        ],
        "notes": {"text": notes_text or ""},
    }
    return clean_text, joav0


def build_clean_and_joav0(
    *,
    cfg: LlamaAgentConfig,
    recipe_id: str,
    raw_text: str,
    source_file: str,
    blocks: list[dict] | None = None,
) -> tuple[str, dict[str, Any]]:
    # New staged LangChain flow: detect sections -> parse ingredients -> parse steps
    if cfg.use_langchain_parser and detect_sections and parse_ingredients_block and parse_steps_block:
        sections = None
        for attempt in range(2):
            try:
                sections = detect_sections(
                    raw_text=raw_text,
                    model=cfg.langchain_ollama_model,
                    temperature=cfg.langchain_temperature,
                    num_ctx=cfg.langchain_num_ctx,
                )
            except Exception as e:
                logger.warning("Section detection failed (try %d): %s", attempt + 1, e)
                sections = None
            if sections and sections.meta and sections.ingredients and sections.method:
                break
            sections = None
        if sections:
            try:
                ing_res = parse_ingredients_block(
                    ingredients_text=sections.ingredients,
                    model=cfg.langchain_ollama_model,
                    temperature=cfg.langchain_temperature,
                    num_ctx=cfg.langchain_num_ctx,
                )
            except Exception as e:
                ing_res = None
                logger.warning("Ingredient parse failed: %s", e)
            try:
                step_res = parse_steps_block(
                    method_text=sections.method,
                    model=cfg.langchain_ollama_model,
                    temperature=cfg.langchain_temperature,
                    num_ctx=cfg.langchain_num_ctx,
                )
            except Exception as e:
                step_res = None
                logger.warning("Step parse failed: %s", e)

            ingredients = []
            if ing_res:
                for ing in ing_res.ingredients:
                    ingredients.append(
                        {
                            "name": ing.name,
                            "quantity": ing.quantity,
                            "unit": ing.unit,
                        }
                    )
            steps = []
            if step_res:
                for st in step_res.steps:
                    # Use instructions as fallback for descr if empty
                    descr = (st.descr or "").strip()
                    instructions = (st.instructions or "").strip()
                    if not descr and instructions:
                        descr = instructions
                    if not descr:
                        descr = "See recipe step"
                    if not instructions:
                        instructions = descr
                    steps.append(
                        {
                            "id": st.id,
                            "descr": descr,
                            "instructions": instructions,
                            "type": st.type,
                            "auto_start": st.auto_start,
                            "requires_confirm": st.requires_confirm,
                        }
                    )
            est_total, diff, serv = _parse_meta_header(sections.meta)
            joav0_doc = {
                "recipe": {
                    "id": recipe_id,
                    "title": sections.meta.splitlines()[0].strip()
                    if sections.meta.strip()
                    else recipe_id.replace("-", " ").title(),
                    "estimated_total": est_total or "PT20M",
                    "locale": "en",
                    "source": "pdf",
                    "servings": serv or 1,
                    "difficulty": diff or "Unknown",
                },
                "ingredients": ingredients,
                "utensils": [],
                "steps": steps
                or [
                    {
                        "id": "step-1",
                        "descr": sections.method.strip() or raw_text[:200],
                        "instructions": sections.method.strip() or raw_text[:200],
                        "type": "immediate",
                        "auto_start": False,
                        "requires_confirm": False,
                    }
                ],
                "notes": {"text": sections.notes.strip() if sections.notes else ""},
            }
            return raw_text, joav0_doc
        else:
            logger.warning("Section detection failed; falling back.")

    # LangChain Pydantic parser attempt (over raw text)
    if cfg.use_langchain_parser and parse_with_langchain_ollama is not None:
        parsed = parse_with_langchain_ollama(
            raw_text=raw_text,
            model=cfg.langchain_ollama_model,
            temperature=cfg.langchain_temperature,
            num_ctx=cfg.langchain_num_ctx,
        )
        if parsed:
            joav0_doc = {
                "recipe": {
                    "id": recipe_id,
                    "title": parsed.recipe.title,
                    "estimated_total": parsed.recipe.estimated_total or "PT20M",
                    "locale": parsed.recipe.locale or "en",
                    "source": parsed.recipe.source or "pdf",
                    "servings": parsed.recipe.servings or 1,
                    "difficulty": parsed.recipe.difficulty or "Unknown",
                },
                "ingredients": [
                    {
                        "name": ing.name,
                        "quantity": ing.quantity,
                        "unit": ing.unit,
                    }
                    for ing in parsed.ingredients
                ],
                "utensils": parsed.utensils,
                "steps": [
                    {
                        "id": step.id,
                        "descr": (step.descr or step.instructions or "See recipe step").strip(),
                        "instructions": (step.instructions or step.descr or "See recipe step").strip(),
                        "type": step.type,
                        "auto_start": step.auto_start,
                        "requires_confirm": step.requires_confirm,
                    }
                    for step in parsed.steps
                ],
                "notes": {"text": parsed.notes.text if parsed.notes else ""},
            }
            # Also return the raw text as clean_text for chunking
            return raw_text, joav0_doc
    elif cfg.use_langchain_parser and parse_with_langchain_ollama is None:
        logger.warning("LangChain parser not available (missing dependency); falling back.")

    if blocks:
        # Column-aware markdown via single LLM call
        left_blocks = [b["text"] for b in blocks if b.get("column") == "left" and b.get("text")]
        right_blocks = [b["text"] for b in blocks if b.get("column") == "right" and b.get("text")]
        try:
            md_resp = chat_json(
                cfg=OllamaConfig(base_url=cfg.ollama_base_url, model=cfg.ollama_model),
                system=SYSTEM_JSON_ONLY,
                user=blocks_to_markdown_prompt(left_blocks=left_blocks, right_blocks=right_blocks),
            )
            markdown_text = ""
            if isinstance(md_resp, dict):
                markdown_text = str(md_resp.get("markdown", "")).strip()
            if markdown_text:
                clean_text = markdown_text
                joav0_doc = parse_markdown_to_joav0(markdown_text, recipe_id=recipe_id)
                return clean_text, joav0_doc
        except Exception as e:
            logger.warning("Markdown build from blocks failed: %s", e)
        # fallback: previous classified flow
        classified = _classify_blocks_with_llama(cfg=cfg, blocks=blocks)
        clean_text, joav0_doc = _parse_blocks_to_joav0(
            classified,
            recipe_id=recipe_id,
            source_file=source_file,
            fallback_text=raw_text,
        )
        return clean_text, joav0_doc

    # Fallback to previous deterministic flow
    clean_text = clean_text_with_llama(cfg=cfg, raw_text=raw_text)
    joav0_doc = parse_joav0_deterministic(clean_text, recipe_id=recipe_id, source_file=source_file)
    return clean_text, joav0_doc


