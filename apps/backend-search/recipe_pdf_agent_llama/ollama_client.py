"""Minimal Ollama HTTP client for local Llama 3.1 usage."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OllamaConfig:
    base_url: str
    model: str
    timeout_s: float = 120.0


class OllamaError(RuntimeError):
    pass


def chat_json(*, cfg: OllamaConfig, system: str, user: str) -> Any:
    """
    Call Ollama /api/chat and return parsed JSON from the model output.

    We instruct the model to output JSON only, but still defensively parse.
    """
    url = cfg.base_url.rstrip("/") + "/api/chat"
    payload = {
        "model": cfg.model,
        "stream": False,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    try:
        # Configure explicit timeouts for all phases (connect, read, write, pool)
        timeout = httpx.Timeout(cfg.timeout_s, read=cfg.timeout_s)
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, json=payload)
        resp.raise_for_status()
    except Exception as exc:
        raise OllamaError(
            f"Failed to call Ollama at {url}. Is Ollama running and is '{cfg.model}' pulled?"
        ) from exc

    data = resp.json()
    content = ""
    try:
        content = data.get("message", {}).get("content", "") or ""
    except AttributeError:
        content = ""
    if not content.strip():
        raise OllamaError("Ollama returned empty content")
    try:
        return _extract_json(content)
    except Exception as exc:
        logger.error("JSON extract failed. Raw content: %s", content)
        raise


def _extract_json(text: str) -> Any:
    """
    Extract the first JSON object/array from text.
    Ollama models sometimes wrap JSON with prose; we handle that.
    """
    text = text.strip()
    
    # Remove markdown code blocks if present
    if text.startswith("```json"):
        text = text[7:]  # Remove ```json
    elif text.startswith("```"):
        text = text[3:]  # Remove ```
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    
    # Fast path
    try:
        return json.loads(text)
    except Exception:
        pass

    def _try_load(candidate: str) -> Any:
        try:
            return json.loads(candidate)
        except Exception:
            return None

    # Heuristic repairs for mild JSON glitches (e.g., extra "}" or trailing commas)
    fixes = []
    # Fix common LLM mistake: using [] instead of {} for objects in arrays
    def _fix_array_objects(text: str) -> str:
        """Fix ["key": "value"] -> [{"key": "value"}]"""
        import re
        # Pattern: [" followed by a key name and colon (start of object)
        text = re.sub(r'\[(?=\s*"[^"]+"\s*:)', '[{', text)
        # Pattern: closing bracket preceded by } (end of object in array)
        text = re.sub(r'}\s*\](?=\s*[,\]])', '}]', text)
        # Pattern: comma followed by [" (next object)
        text = re.sub(r',\s*\[(?=\s*"[^"]+"\s*:)', ', {', text)
        return text
    fixes.append(_fix_array_objects)
    fixes.append(lambda s: s.replace("}}}", "}}"))  # collapse triple
    fixes.append(lambda s: s.replace("}}", "}"))  # collapse double close
    fixes.append(lambda s: s.replace(",]", "]"))  # trailing comma in array
    fixes.append(lambda s: s.replace(", }", " }"))  # stray comma before object close
    fixes.append(lambda s: s.replace(",  }", " }"))  # minor variant
    fixes.append(lambda s: s.replace(",\n]", "\n]"))  # trailing comma before ]
    fixes.append(lambda s: s.replace(",\r]", "\r]"))  # windows newline variant
    fixes.append(lambda s: s.replace("\r", "\\r").replace("\n", "\\n"))  # escape raw newlines in strings
    # Attempt to fix unterminated strings for clean_text: ensure closing quote and brace
    def _fix_unterminated(text: str) -> str:
        if '"clean_text": "' in text and text.count('"clean_text": "') == 1:
            # naive fix: ensure the last quote is present and close the object
            if text.strip().endswith('"}') is False:
                return text.rstrip() + '"}'
        return text
    fixes.append(_fix_unterminated)

    for fix in fixes:
        fixed = fix(text)
        loaded = _try_load(fixed)
        if loaded is not None:
            return loaded

    # Find a likely JSON block
    starts = []
    for ch in ("{", "["):
        i = text.find(ch)
        if i != -1:
            starts.append(i)
    if not starts:
        logger.error(f"Model output did not contain JSON. Output was: {text[:500]}...")
        raise OllamaError("Model output did not contain JSON")
    start = min(starts)

    # Walk to find matching end (simple stack)
    stack: list[str] = []
    for idx in range(start, len(text)):
        c = text[idx]
        if c in "{[":
            stack.append(c)
        elif c in "}]":
            if not stack:
                continue
            opener = stack.pop()
            if (opener, c) not in (("{", "}"), ("[", "]")):
                continue
            if not stack:
                candidate = text[start : idx + 1]
                try:
                    return json.loads(candidate)
                except Exception as e:
                    logger.error(f"JSON parse failed: {e}. Candidate was: {candidate[:500]}...")
                    break
    
    logger.error(f"Could not parse JSON from model output. Full output: {text[:1000]}...")
    raise OllamaError("Could not parse JSON from model output")


