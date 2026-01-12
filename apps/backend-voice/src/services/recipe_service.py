"""
Recipe Service

Fetches recipes from Supabase (single source of truth).
Falls back to local files if Supabase is unavailable.
"""

import json
import logging
import os
from pathlib import Path
from typing import Any

from supabase import create_client, Client

logger = logging.getLogger(__name__)


class RecipeService:
    """
    Service for fetching recipes.
    
    Priority order:
    1. Supabase (if configured and available)
    2. Local files (fallback)
    """
    
    def __init__(self):
        """Initialize the recipe service."""
        self._client: Client | None = None
        self._local_recipes_dir: Path | None = None
        
        # Try to initialize Supabase client
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if supabase_url and supabase_key:
            try:
                self._client = create_client(supabase_url, supabase_key)
                logger.info("RecipeService: Supabase client initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize Supabase client: {e}")
        else:
            logger.info("RecipeService: Supabase not configured, using local files only")
        
        # Set up local fallback
        recipes_dir = os.getenv("RECIPES_DIR", "../../data/recipes")
        self._local_recipes_dir = Path(recipes_dir)
        if not self._local_recipes_dir.is_absolute():
            self._local_recipes_dir = Path(__file__).parent.parent.parent / recipes_dir
    
    async def get_recipe(self, recipe_id: str) -> dict | None:
        """
        Fetch recipe by ID or slug.
        
        Args:
            recipe_id: Recipe ID or slug (e.g., "mushroom-risotto")
            
        Returns:
            Full JOAv0 recipe document or None if not found
        """
        # Try Supabase first
        if self._client:
            try:
                recipe = await self._fetch_from_supabase(recipe_id)
                if recipe:
                    logger.info(f"Fetched recipe '{recipe_id}' from Supabase")
                    return recipe
            except Exception as e:
                logger.warning(f"Supabase fetch failed for '{recipe_id}': {e}")
        
        # Fall back to local files
        recipe = await self._load_from_local(recipe_id)
        if recipe:
            logger.info(f"Loaded recipe '{recipe_id}' from local files")
        else:
            logger.warning(f"Recipe not found: {recipe_id}")
        
        return recipe
    
    async def get_recipe_with_fallback(
        self,
        recipe_id: str,
        frontend_payload: dict | None = None,
    ) -> dict | None:
        """
        Fetch recipe with frontend payload as additional fallback.
        
        This maintains backward compatibility with the current flow
        where frontend sends recipe payload via WebSocket.
        
        Args:
            recipe_id: Recipe ID or slug
            frontend_payload: Optional recipe payload from frontend
            
        Returns:
            Full JOAv0 recipe document
        """
        # Try Supabase/local first (source of truth)
        recipe = await self.get_recipe(recipe_id)
        if recipe:
            return recipe
        
        # Fall back to frontend payload (backward compatibility)
        if frontend_payload:
            logger.info(f"Using frontend-provided payload for '{recipe_id}'")
            return frontend_payload
        
        return None
    
    async def _fetch_from_supabase(self, recipe_id: str) -> dict | None:
        """Fetch recipe from Supabase by ID or slug."""
        if not self._client:
            return None
        
        # Try by slug first (most common)
        response = self._client.table("recipes") \
            .select("recipe_json") \
            .eq("slug", recipe_id) \
            .eq("status", "published") \
            .single() \
            .execute()
        
        if response.data:
            return response.data["recipe_json"]
        
        # Try by UUID if it looks like one
        if len(recipe_id) == 36 and "-" in recipe_id:
            response = self._client.table("recipes") \
                .select("recipe_json") \
                .eq("id", recipe_id) \
                .eq("status", "published") \
                .single() \
                .execute()
            
            if response.data:
                return response.data["recipe_json"]
        
        return None
    
    async def _load_from_local(self, recipe_id: str) -> dict | None:
        """Load recipe from local JSON files."""
        if not self._local_recipes_dir or not self._local_recipes_dir.exists():
            return None
        
        # Try exact filename match
        json_path = self._local_recipes_dir / f"{recipe_id}.json"
        if json_path.exists():
            return self._load_json_file(json_path)
        
        # Search all files for matching recipe ID
        for path in self._local_recipes_dir.glob("*.json"):
            recipe = self._load_json_file(path)
            if recipe and recipe.get("recipe", {}).get("id") == recipe_id:
                return recipe
        
        return None
    
    def _load_json_file(self, path: Path) -> dict | None:
        """Load and parse a JSON file."""
        try:
            with path.open("r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load {path}: {e}")
            return None
    
    async def list_recipes(
        self,
        limit: int = 50,
        category: str | None = None,
        mood: str | None = None,
    ) -> list[dict]:
        """
        List available recipes.
        
        Returns metadata only (not full recipe JSON).
        """
        if self._client:
            try:
                query = self._client.table("recipes") \
                    .select("slug, metadata, quality_score") \
                    .eq("status", "published") \
                    .order("quality_score", desc=True) \
                    .limit(limit)
                
                if category:
                    query = query.contains("metadata->>categories", [category])
                if mood:
                    query = query.contains("metadata->>moods", [mood])
                
                response = query.execute()
                return response.data or []
            except Exception as e:
                logger.warning(f"Failed to list recipes from Supabase: {e}")
        
        # Fall back to local files
        return await self._list_local_recipes(limit)
    
    async def _list_local_recipes(self, limit: int) -> list[dict]:
        """List recipes from local files."""
        if not self._local_recipes_dir or not self._local_recipes_dir.exists():
            return []
        
        recipes = []
        for path in sorted(self._local_recipes_dir.glob("*.json"))[:limit]:
            recipe = self._load_json_file(path)
            if recipe:
                recipes.append({
                    "slug": path.stem,
                    "metadata": {
                        "title": recipe.get("recipe", {}).get("title"),
                    },
                })
        
        return recipes


# Singleton instance
_recipe_service: RecipeService | None = None


def get_recipe_service() -> RecipeService:
    """Get the singleton RecipeService instance."""
    global _recipe_service
    if _recipe_service is None:
        _recipe_service = RecipeService()
    return _recipe_service
