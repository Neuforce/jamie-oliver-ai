"""
Recipe registry and storage abstraction.

Supports loading recipes from the local /recipes directory or from a remote
manifest/blob store. Provides metadata listing plus helpers to fetch the full
recipe payload for execution.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from threading import RLock
from typing import Dict, List, Optional
from urllib.error import URLError
from urllib.request import urlopen

from ccai.core.logger import configure_logger

from src.config import settings
from src.recipe_engine import Recipe

logger = configure_logger(__name__)


@dataclass
class RecipeMetadata:
    """Public recipe metadata returned to clients."""

    id: str
    title: str
    description: Optional[str] = None
    estimated_total: Optional[str] = None
    difficulty: Optional[str] = None
    servings: Optional[int] = None
    tags: List[str] = field(default_factory=list)
    source: Optional[str] = None


@dataclass
class RecipeRecord(RecipeMetadata):
    """Internal record that knows how to load the recipe payload."""

    path: Optional[Path] = None
    url: Optional[str] = None


class RecipeRegistry:
    """Central registry for listing and loading recipes."""

    def __init__(self):
        self._source = settings.RECIPES_SOURCE
        self._recipes_dir = Path(settings.RECIPES_DIR).resolve()
        self._manifest_url = settings.RECIPES_MANIFEST_URL
        self._records: Dict[str, RecipeRecord] = {}
        self._lock = RLock()
        self.refresh(force=True)

    # ------------------------------------------------------------------ public
    def refresh(self, force: bool = False) -> None:
        """Reload recipes from the configured source."""
        with self._lock:
            if self._records and not force:
                return

            if self._source == "remote":
                self._load_remote_manifest()
            else:
                self._load_local_directory()

            if not self._records:
                logger.warning("No recipes discovered in registry")

    def list_recipes(self) -> List[Dict[str, Optional[str]]]:
        """Return recipes as serialisable dictionaries."""
        with self._lock:
            return [asdict(record) for record in self._records.values()]

    def get_recipe_payload(self, recipe_id: str) -> Dict:
        """Return the raw recipe JSON payload."""
        record = self._records.get(recipe_id)
        if not record:
            raise KeyError(f"Recipe '{recipe_id}' not found")

        if record.path:
            with record.path.open() as handle:
                return json.load(handle)

        if record.url:
            try:
                with urlopen(record.url) as response:  # nosec - trusted config
                    return json.load(response)
            except URLError as exc:
                raise RuntimeError(f"Unable to download recipe '{recipe_id}': {exc}") from exc

        raise RuntimeError(f"Recipe '{recipe_id}' has no data source configured")

    def load_recipe_for_engine(self, recipe_id: str) -> Recipe:
        """Load the recipe into a Recipe model."""
        payload = self.get_recipe_payload(recipe_id)
        return Recipe.from_dict(payload)

    # ----------------------------------------------------------------- loaders
    def _load_local_directory(self) -> None:
        """Scan local recipes directory."""
        if not self._recipes_dir.exists():
            logger.warning(f"Recipes directory {self._recipes_dir} does not exist")
            self._records = {}
            return

        records: Dict[str, RecipeRecord] = {}
        for recipe_file in sorted(self._recipes_dir.glob("*.json")):
            try:
                with recipe_file.open() as handle:
                    data = json.load(handle)
                record = self._record_from_payload(data)
                record.path = recipe_file
                records[record.id] = record
            except Exception as exc:
                logger.error(f"Failed to load recipe metadata from {recipe_file}: {exc}")

        self._records = records

    def _load_remote_manifest(self) -> None:
        """Load recipe metadata from a remote manifest file."""
        if not self._manifest_url:
            logger.error("RECIPES_MANIFEST_URL not configured for remote source")
            self._records = {}
            return

        try:
            with urlopen(self._manifest_url) as handle:  # nosec - trusted config
                manifest = json.load(handle)
        except URLError as exc:
            logger.error(f"Unable to download recipe manifest: {exc}")
            self._records = {}
            return

        records: Dict[str, RecipeRecord] = {}
        for entry in manifest:
            try:
                record = RecipeRecord(
                    id=entry["id"],
                    title=entry["title"],
                    description=entry.get("description"),
                    estimated_total=entry.get("estimated_total"),
                    difficulty=entry.get("difficulty"),
                    servings=entry.get("servings"),
                    tags=entry.get("tags", []),
                    source=entry.get("source"),
                    url=entry.get("url"),
                )
                records[record.id] = record
            except KeyError as exc:
                logger.error(f"Invalid manifest entry missing {exc}: {entry}")

        self._records = records

    @staticmethod
    def _record_from_payload(payload: Dict) -> RecipeRecord:
        """Build metadata from a full recipe payload."""
        recipe_meta = payload.get("recipe", {})
        return RecipeRecord(
            id=recipe_meta.get("id"),
            title=recipe_meta.get("title", "Unknown recipe"),
            description=recipe_meta.get("description"),
            estimated_total=recipe_meta.get("estimated_total"),
            difficulty=recipe_meta.get("difficulty"),
            servings=recipe_meta.get("servings"),
            tags=recipe_meta.get("tags", []),
            source=recipe_meta.get("source"),
        )


# Singleton registry used across the application
recipe_registry = RecipeRegistry()


