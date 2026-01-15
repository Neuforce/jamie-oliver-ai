"""Data models and enums for the recipe engine."""

from __future__ import annotations
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Any
from datetime import datetime


class StepStatus(Enum):
    """Status of a recipe step."""
    PENDING = "pending"
    READY = "ready"
    ACTIVE = "active"
    WAITING_ACK = "waiting_ack"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class EventType(Enum):
    """Types of events emitted by the recipe engine."""
    STEP_READY = "step_ready"
    STEP_START = "step_start"
    TIMER_SET = "timer_set"
    TIMER_DONE = "timer_done"
    TIMER_STARTED = "timer_started"      # New: Timer explicitly started (decoupled from step)
    TIMER_CANCELLED = "timer_cancelled"  # New: Timer cancelled by user
    TIMER_LIST_UPDATE = "timer_list_update"  # New: Active timers list changed
    REMINDER_TICK = "reminder_tick"
    STEP_CONFIRM_DONE = "step_confirm_done"
    STEP_COMPLETED = "step_completed"
    ALL_COMPLETED = "all_completed"
    MESSAGE = "message"
    ERROR = "error"


@dataclass
class Event:
    """Event emitted by the recipe engine."""
    type: EventType
    payload: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class ActiveTimer:
    """
    An independent timer that can run concurrently with other timers.
    
    Timers are decoupled from step state - a step can be active without
    its timer running, and timers can continue running while the user
    navigates to other steps (parallel cooking workflow).
    """
    id: str                           # Unique timer ID (e.g., "timer_roast_squash" or "custom_123")
    step_id: Optional[str]            # Linked step ID (None for custom user timers)
    label: str                        # Display label (e.g., "Roast squash" or custom)
    duration_secs: int                # Total duration in seconds
    started_at: datetime              # When timer was started
    remaining_secs: Optional[int] = None  # Calculated remaining time
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "step_id": self.step_id,
            "label": self.label,
            "duration_secs": self.duration_secs,
            "started_at": self.started_at.isoformat(),
            "remaining_secs": self.remaining_secs,
        }


@dataclass
class RecipeStep:
    """A single step in a recipe."""
    id: str
    descr: str
    type: str  # "immediate" or "timer"
    status: StepStatus = StepStatus.PENDING
    depends_on: List[str] = field(default_factory=list)
    next: List[str] = field(default_factory=list)
    auto_start: bool = True
    duration: Optional[str] = None  # ISO 8601 duration (e.g., "PT50M")
    reminder: Optional[Dict[str, str]] = None
    requires_confirm: bool = False
    unlock_when: str = "all"  # "all" or "any" for multiple dependencies
    on_enter: List[Dict[str, str]] = field(default_factory=list)


@dataclass
class Recipe:
    """A complete recipe with metadata and steps."""
    id: str
    title: str
    servings: int
    estimated_total: str
    difficulty: str
    locale: str
    steps: Dict[str, RecipeStep]

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> "Recipe":
        """Load a recipe from a dictionary."""
        recipe_meta = data["recipe"]
        steps = {}
        
        for s in data["steps"]:
            steps[s["id"]] = RecipeStep(
                id=s["id"],
                descr=s["descr"],
                type=s.get("type", "immediate"),
                depends_on=s.get("depends_on", []),
                next=s.get("next", []),
                auto_start=s.get("auto_start", True),
                duration=s.get("duration"),
                reminder=s.get("reminder"),
                requires_confirm=s.get("requires_confirm", False),
                unlock_when=s.get("unlock_when", "all"),
                on_enter=s.get("on_enter", []),
            )
        
        return Recipe(
            id=recipe_meta["id"],
            title=recipe_meta["title"],
            servings=recipe_meta["servings"],
            estimated_total=recipe_meta["estimated_total"],
            difficulty=recipe_meta["difficulty"],
            locale=recipe_meta["locale"],
            steps=steps,
        )

    @staticmethod
    def from_file(file_path: str) -> "Recipe":
        """Load a recipe from a JSON file."""
        with open(file_path, 'r') as f:
            data = json.load(f)
        return Recipe.from_dict(data)

