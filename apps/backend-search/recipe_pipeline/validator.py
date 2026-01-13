"""
Recipe Quality Validator

Validates recipe structure and computes quality scores.
"""

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ValidationResult:
    """Result of recipe validation."""
    is_valid: bool
    quality_score: int  # 0-100
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    quality_breakdown: dict[str, int] = field(default_factory=dict)


class RecipeValidator:
    """Validates recipe quality and structure."""
    
    # Keywords that indicate a step should have a timer
    TIMER_KEYWORDS = [
        "minute", "minutes", "min", "mins",
        "hour", "hours", "hr", "hrs",
        "second", "seconds", "sec", "secs",
        "wait", "rest", "simmer", "bake", "roast",
        "cook for", "boil for", "fry for",
        "leave", "set aside", "let it",
    ]
    
    def validate(self, recipe_json: dict) -> ValidationResult:
        """
        Validate a recipe and compute quality score.
        
        Args:
            recipe_json: Full JOAv0 recipe document
            
        Returns:
            ValidationResult with score and issues
        """
        errors: list[str] = []
        warnings: list[str] = []
        breakdown: dict[str, int] = {}
        
        recipe = recipe_json.get("recipe", {})
        steps = recipe_json.get("steps", [])
        ingredients = recipe_json.get("ingredients", [])
        utensils = recipe_json.get("utensils", [])
        
        # =====================================================================
        # Required Fields (Critical)
        # =====================================================================
        
        # Recipe title
        if not recipe.get("title"):
            errors.append("Missing recipe title")
            breakdown["title"] = 0
        else:
            breakdown["title"] = 10
        
        # Recipe ID
        if not recipe.get("id"):
            errors.append("Missing recipe ID")
            breakdown["id"] = 0
        else:
            breakdown["id"] = 5
        
        # Steps
        if not steps:
            errors.append("No steps defined")
            breakdown["steps_exist"] = 0
        else:
            breakdown["steps_exist"] = 10
        
        # Ingredients
        if not ingredients:
            warnings.append("No ingredients listed")
            breakdown["ingredients"] = 0
        else:
            breakdown["ingredients"] = 10
        
        # =====================================================================
        # Step Quality Checks
        # =====================================================================
        
        if steps:
            # Check for semantic step IDs (not step_1, step_2, etc.)
            # JOAv0 format uses "id", older format uses "step_id"
            generic_ids = [s for s in steps if self._is_generic_step_id(s.get("id", s.get("step_id", "")))]
            if generic_ids:
                warnings.append(f"{len(generic_ids)} steps have generic IDs (e.g., 'step_1')")
                breakdown["semantic_step_ids"] = max(0, 15 - len(generic_ids) * 2)
            else:
                breakdown["semantic_step_ids"] = 15
            
            # Check for on_enter.say messages
            missing_say = [s for s in steps if not self._has_on_enter_say(s)]
            if missing_say:
                warnings.append(f"{len(missing_say)} steps missing on_enter.say")
                breakdown["on_enter_say"] = max(0, 20 - len(missing_say) * 3)
            else:
                breakdown["on_enter_say"] = 20
            
            # Check for timer steps where appropriate
            potential_timer_steps = self._find_potential_timer_steps(steps)
            actual_timer_steps = [s for s in steps if s.get("type") == "timer"]
            
            if potential_timer_steps and not actual_timer_steps:
                warnings.append(f"{len(potential_timer_steps)} steps might need timer type")
                breakdown["timer_detection"] = 5
            elif actual_timer_steps:
                breakdown["timer_detection"] = 15
            else:
                breakdown["timer_detection"] = 10  # No timers needed
            
            # Check for requires_confirm flags
            confirm_steps = [s for s in steps if s.get("requires_confirm", False)]
            if not confirm_steps:
                warnings.append("No steps require confirmation - agent won't wait for user")
                breakdown["requires_confirm"] = 0
            elif len(confirm_steps) < len(steps) / 2:
                breakdown["requires_confirm"] = 5
            else:
                breakdown["requires_confirm"] = 10
            
            # Check say message quality (not too short)
            short_says = self._count_short_say_messages(steps)
            if short_says > 0:
                warnings.append(f"{short_says} steps have very short instructions")
                breakdown["say_quality"] = max(0, 10 - short_says * 2)
            else:
                breakdown["say_quality"] = 10
        
        # =====================================================================
        # Additional Quality Checks
        # =====================================================================
        
        # Utensils
        if utensils:
            breakdown["utensils"] = 5
        else:
            warnings.append("No utensils listed")
            breakdown["utensils"] = 0
        
        # Recipe metadata
        metadata_score = 0
        if recipe.get("servings"):
            metadata_score += 2
        if recipe.get("prep_time") or recipe.get("total_time"):
            metadata_score += 2
        if recipe.get("difficulty"):
            metadata_score += 1
        breakdown["metadata"] = metadata_score
        
        # =====================================================================
        # Compute Final Score
        # =====================================================================
        
        total_score = sum(breakdown.values())
        # Normalize to 100 if needed
        max_possible = 100
        quality_score = min(100, int((total_score / max_possible) * 100))
        
        # Ensure errors reduce score significantly
        if errors:
            quality_score = min(quality_score, 40)
        
        return ValidationResult(
            is_valid=len(errors) == 0,
            quality_score=quality_score,
            errors=errors,
            warnings=warnings,
            quality_breakdown=breakdown,
        )
    
    def _is_generic_step_id(self, step_id: str) -> bool:
        """Check if step_id is generic like 'step_1', 'step_2'."""
        if not step_id:
            return True
        return bool(re.match(r"^step[_-]?\d+$", step_id.lower()))
    
    def _get_say_from_on_enter(self, step: dict) -> str:
        """
        Extract say message from on_enter.
        
        Handles both formats:
        - JOAv0: on_enter is a list of actions: [{"say": "..."}]
        - Flat: on_enter is a dict: {"say": "..."}
        """
        on_enter = step.get("on_enter")
        
        if not on_enter:
            # Fallback to instructions or descr
            return step.get("instructions", "") or step.get("descr", "")
        
        # JOAv0 format: list of actions
        if isinstance(on_enter, list):
            for action in on_enter:
                if isinstance(action, dict) and "say" in action:
                    return action.get("say", "")
            return ""
        
        # Flat dict format
        if isinstance(on_enter, dict):
            return on_enter.get("say", "")
        
        return ""
    
    def _has_on_enter_say(self, step: dict) -> bool:
        """Check if step has a non-empty on_enter.say message."""
        say = self._get_say_from_on_enter(step)
        return bool(say and len(say.strip()) > 10)
    
    def _find_potential_timer_steps(self, steps: list[dict]) -> list[dict]:
        """Find steps that might need a timer based on their content."""
        potential = []
        for step in steps:
            if step.get("type") == "timer":
                continue  # Already a timer
            
            say = self._get_say_from_on_enter(step).lower()
            instruction = (step.get("instructions", "") or step.get("instruction", "")).lower()
            text = f"{say} {instruction}"
            
            if any(kw in text for kw in self.TIMER_KEYWORDS):
                potential.append(step)
        
        return potential
    
    def _count_short_say_messages(self, steps: list[dict], min_length: int = 30) -> int:
        """Count steps with very short say messages."""
        count = 0
        for step in steps:
            say = self._get_say_from_on_enter(step)
            if say and len(say.strip()) < min_length:
                count += 1
        return count
    
    def get_quality_summary(self, result: ValidationResult) -> str:
        """Generate a human-readable quality summary."""
        lines = [
            f"Quality Score: {result.quality_score}/100",
            f"Valid: {'✅' if result.is_valid else '❌'}",
        ]
        
        if result.errors:
            lines.append("\nErrors:")
            for error in result.errors:
                lines.append(f"  ❌ {error}")
        
        if result.warnings:
            lines.append("\nWarnings:")
            for warning in result.warnings:
                lines.append(f"  ⚠️ {warning}")
        
        if result.quality_breakdown:
            lines.append("\nBreakdown:")
            for key, value in sorted(result.quality_breakdown.items()):
                lines.append(f"  {key}: {value}")
        
        return "\n".join(lines)
