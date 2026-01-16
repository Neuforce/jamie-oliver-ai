"""
Recipe Uploader

Uploads validated recipes to Supabase with:
- Version control
- Metadata computation
- Search index sync
"""

import json
import logging
import os
from typing import Any

from supabase import create_client, Client

from .validator import ValidationResult

logger = logging.getLogger(__name__)


class RecipeUploader:
    """Uploads recipes to Supabase."""
    
    def __init__(self):
        """Initialize with Supabase client."""
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not supabase_key:
            raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        
        self.client: Client = create_client(supabase_url, supabase_key)
    
    def upload(
        self,
        slug: str,
        recipe_json: dict,
        validation: ValidationResult,
        source_url: str | None = None,
        source_type: str = "enhanced",
        publish: bool = True,  # Default to published - enhanced recipes should be live
    ) -> dict:
        """
        Upload recipe to Supabase.
        
        Args:
            slug: URL-friendly recipe identifier
            recipe_json: Full JOAv0 recipe document
            validation: Validation result with quality score
            source_url: Original URL if scraped
            source_type: manual, scraped, imported, enhanced
            publish: Whether to publish immediately
            
        Returns:
            Uploaded recipe record
        """
        logger.info(f"Uploading recipe: {slug}")
        
        # Sanitize recipe_json to remove null characters that Supabase can't handle
        recipe_json = self._sanitize_json(recipe_json)
        
        # Compute metadata from recipe_json
        metadata = self._compute_metadata(recipe_json, validation)
        
        # Check if recipe already exists
        existing = self.client.table("recipes") \
            .select("id, version, recipe_json") \
            .eq("slug", slug) \
            .execute()
        
        if existing.data:
            # Update existing recipe
            existing_record = existing.data[0]
            logger.info(f"Recipe {slug} exists (version {existing_record['version']}), updating...")
            
            # Save version history
            self._save_version_history(
                recipe_id=existing_record["id"],
                version=existing_record["version"],
                recipe_json=existing_record["recipe_json"],
                metadata=metadata,
            )
            
            # Update recipe (version auto-increments via trigger)
            result = self.client.table("recipes") \
                .update({
                    "recipe_json": recipe_json,
                    "metadata": metadata,
                    "quality_score": validation.quality_score,
                    "source_type": source_type,
                    "status": "published" if publish else "draft",
                    "published_at": "now()" if publish else None,
                }) \
                .eq("slug", slug) \
                .execute()
            
            logger.info(f"✅ Updated recipe {slug}")
        else:
            # Insert new recipe
            result = self.client.table("recipes").insert({
                "slug": slug,
                "recipe_json": recipe_json,
                "metadata": metadata,
                "quality_score": validation.quality_score,
                "source_url": source_url,
                "source_type": source_type,
                "status": "published" if publish else "draft",
                "published_at": "now()" if publish else None,
            }).execute()
            
            logger.info(f"✅ Created new recipe {slug}")
        
        if not result.data:
            raise RuntimeError(f"Failed to upload recipe {slug}")
        
        return result.data[0]
    
    def _save_version_history(
        self,
        recipe_id: str,
        version: int,
        recipe_json: dict,
        metadata: dict,
    ) -> None:
        """Save a version snapshot to recipe_versions table."""
        try:
            self.client.table("recipe_versions").insert({
                "recipe_id": recipe_id,
                "version": version,
                "recipe_json": recipe_json,
                "metadata": metadata,
                "change_summary": "Auto-saved before update",
            }).execute()
            logger.debug(f"Saved version {version} to history")
        except Exception as e:
            logger.warning(f"Failed to save version history: {e}")
    
    def _compute_metadata(self, recipe_json: dict, validation: ValidationResult) -> dict:
        """Compute metadata from recipe_json for fast queries."""
        recipe = recipe_json.get("recipe", {})
        steps = recipe_json.get("steps", [])
        ingredients = recipe_json.get("ingredients", [])
        utensils = recipe_json.get("utensils", [])
        
        # Count timers
        timer_steps = [s for s in steps if s.get("type") == "timer"]
        
        # Check quality indicators
        # Handle JOAv0 format where on_enter is a list: [{"say": "..."}]
        has_on_enter_say = all(
            self._has_on_enter_say(s)
            for s in steps
        )
        # JOAv0 format uses "id", older format uses "step_id"
        has_semantic_ids = not any(
            self._is_generic_step_id(s.get("id", s.get("step_id", "")))
            for s in steps
        )
        
        return {
            "title": recipe.get("title"),
            "description": recipe.get("description", "")[:200],  # Truncate for metadata
            "total_time_minutes": self._parse_time_to_minutes(recipe.get("total_time")),
            "prep_time_minutes": self._parse_time_to_minutes(recipe.get("prep_time")),
            "cook_time_minutes": self._parse_time_to_minutes(recipe.get("cook_time")),
            "servings": recipe.get("servings"),
            "difficulty": recipe.get("difficulty"),
            "step_count": len(steps),
            "has_timers": len(timer_steps) > 0,
            "timer_count": len(timer_steps),
            "ingredient_count": len(ingredients),
            "utensil_count": len(utensils),
            "categories": recipe.get("categories", []),
            "moods": recipe.get("moods", []),
            "image_url": recipe.get("image_url"),
            "quality_indicators": {
                "has_on_enter_say": has_on_enter_say,
                "has_semantic_step_ids": has_semantic_ids,
                "has_timer_steps": len(timer_steps) > 0,
                "quality_score": validation.quality_score,
            },
        }
    
    def _parse_time_to_minutes(self, time_str: str | None) -> int | None:
        """Parse ISO duration or time string to minutes."""
        if not time_str:
            return None
        
        import re
        
        # ISO 8601 duration: PT30M, PT1H30M, etc.
        iso_match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?", time_str)
        if iso_match:
            hours = int(iso_match.group(1) or 0)
            minutes = int(iso_match.group(2) or 0)
            return hours * 60 + minutes
        
        # Simple "30 minutes" format
        simple_match = re.match(r"(\d+)\s*(?:minutes?|mins?)", time_str, re.IGNORECASE)
        if simple_match:
            return int(simple_match.group(1))
        
        # Hours: "1 hour"
        hour_match = re.match(r"(\d+)\s*(?:hours?|hrs?)", time_str, re.IGNORECASE)
        if hour_match:
            return int(hour_match.group(1)) * 60
        
        return None
    
    def _is_generic_step_id(self, step_id: str) -> bool:
        """Check if step_id is generic."""
        import re
        if not step_id:
            return True
        return bool(re.match(r"^step[_-]?\d+$", step_id.lower()))
    
    def _sanitize_json(self, obj: Any) -> Any:
        """
        Recursively sanitize JSON to remove null characters and other 
        problematic Unicode that Supabase/PostgreSQL can't handle.
        """
        if isinstance(obj, dict):
            return {k: self._sanitize_json(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._sanitize_json(item) for item in obj]
        elif isinstance(obj, str):
            # Remove null characters and other control characters
            return obj.replace('\x00', '').replace('\u0000', '')\
                      .replace('\x12', '').replace('\x13', '')\
                      .replace('\x19', '')
        else:
            return obj
    
    def _has_on_enter_say(self, step: dict) -> bool:
        """
        Check if step has a non-empty on_enter say message.
        Handles both JOAv0 list format and flat dict format.
        """
        on_enter = step.get("on_enter")
        if not on_enter:
            # Check for fallback fields
            return bool(step.get("instructions") or step.get("descr"))
        
        # JOAv0 format: list of actions [{"say": "..."}]
        if isinstance(on_enter, list):
            for action in on_enter:
                if isinstance(action, dict) and action.get("say"):
                    return True
            return False
        
        # Flat dict format: {"say": "..."}
        if isinstance(on_enter, dict):
            return bool(on_enter.get("say"))
        
        return False
    
    def get_recipe(self, slug: str) -> dict | None:
        """Fetch a recipe by slug."""
        result = self.client.table("recipes") \
            .select("*") \
            .eq("slug", slug) \
            .single() \
            .execute()
        
        return result.data if result.data else None
    
    def list_recipes(
        self,
        status: str = "published",
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        """List recipes with pagination."""
        result = self.client.table("recipes") \
            .select("id, slug, metadata, quality_score, status, created_at") \
            .eq("status", status) \
            .order("quality_score", desc=True) \
            .range(offset, offset + limit - 1) \
            .execute()
        
        return result.data or []
    
    def publish_recipe(self, slug: str) -> dict:
        """Publish a draft recipe."""
        result = self.client.table("recipes") \
            .update({
                "status": "published",
                "published_at": "now()",
            }) \
            .eq("slug", slug) \
            .execute()
        
        if not result.data:
            raise ValueError(f"Recipe not found: {slug}")
        
        logger.info(f"✅ Published recipe: {slug}")
        return result.data[0]


def upload_recipe(recipe_json: dict, publish: bool = True) -> dict:
    """
    Convenience function to upload a recipe.
    
    Args:
        recipe_json: Full JOAv0 recipe document
        publish: Whether to publish immediately
        
    Returns:
        Uploaded recipe record
    """
    from .validator import RecipeValidator
    
    uploader = RecipeUploader()
    validator = RecipeValidator()
    
    # Validate
    validation = validator.validate(recipe_json)
    
    # Extract slug and source URL
    recipe_meta = recipe_json.get("recipe", {})
    slug = recipe_meta.get("id", recipe_meta.get("slug", "unknown"))
    source_url = recipe_meta.get("source_url")
    
    # Valid source_type values: manual, scraped, imported, enhanced
    source_type = "scraped" if source_url else "manual"
    
    return uploader.upload(
        slug=slug,
        recipe_json=recipe_json,
        validation=validation,
        source_url=source_url,
        source_type=source_type,
        publish=publish
    )
