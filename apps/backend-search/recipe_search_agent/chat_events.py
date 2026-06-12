"""Discovery chat streaming event types."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class ChatEvent:
    """
    Event emitted during chat processing.

    Structured payloads (recipes, recipe_detail, …) MUST include
    metadata.tool_call_id and metadata.response_id so the client can bind
    cards to the tool invocation that produced them.
    """

    type: str
    content: str
    metadata: Optional[dict[str, Any]] = None
