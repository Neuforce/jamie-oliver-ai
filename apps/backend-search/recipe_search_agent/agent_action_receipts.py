"""Audit vocabulary and recorder for agent action receipts."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

AgentActionKind = Literal["read", "write"]
ApprovalOutcome = Literal["accept", "decline", "cancel"]
AgentActionChannel = Literal["chat", "voice", "auto"]

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AgentActionReceiptInput:
    action_name: str
    kind: AgentActionKind
    channel: AgentActionChannel
    outcome: ApprovalOutcome
    decision_detail: str | None = None
    backend_recipe_id: str | None = None
    ask_id: str | None = None
    standing_authorization_mandate_id: str | None = None
    session_id: str | None = None
    user_id: str | None = None
    tool_call_id: str | None = None
    response_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def record_agent_action_receipt(receipt: AgentActionReceiptInput) -> None:
    """Persist an action receipt; never fail caller behavior on errors."""
    payload = {
        "id": str(uuid.uuid4()),
        "user_id": receipt.user_id,
        "session_id": receipt.session_id,
        "action_name": receipt.action_name,
        "kind": receipt.kind,
        "channel": receipt.channel,
        "outcome": receipt.outcome,
        "decision_detail": receipt.decision_detail,
        "backend_recipe_id": receipt.backend_recipe_id,
        "ask_id": receipt.ask_id,
        "standing_authorization_mandate_id": receipt.standing_authorization_mandate_id,
        "tool_call_id": receipt.tool_call_id,
        "response_id": receipt.response_id,
        "metadata": receipt.metadata,
        "recorded_at": _utc_now_iso(),
    }
    try:
        from recipe_search_agent.repositories import AgentActionReceiptRepository

        AgentActionReceiptRepository().create_receipt(payload)
    except Exception:
        logger.exception(
            "Failed to record agent action receipt for action %s",
            receipt.action_name,
        )
