"""
Recipe Pipeline Data Models

Defines the data structures used throughout the ingestion pipeline.
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class StepType(str, Enum):
    """Type of cooking step."""
    IMMEDIATE = "immediate"
    TIMER = "timer"


class DietType(str, Enum):
    """Dietary classifications from schema.org."""
    VEGETARIAN = "vegetarian"
    VEGAN = "vegan"
    GLUTEN_FREE = "gluten-free"
    DAIRY_FREE = "dairy-free"
    LOW_LACTOSE = "low-lactose"
    HALAL = "halal"
    KOSHER = "kosher"


@dataclass
class ImageInfo:
    """Recipe image information."""
    url: str
    width: Optional[int] = None
    height: Optional[int] = None
    local_path: Optional[str] = None
    cdn_url: Optional[str] = None


@dataclass
class NutritionInfo:
    """Nutritional information."""
    calories: Optional[str] = None
    carbohydrates: Optional[str] = None
    fat: Optional[str] = None
    fiber: Optional[str] = None
    protein: Optional[str] = None
    sodium: Optional[str] = None
    saturated_fat: Optional[str] = None
    sugar: Optional[str] = None


@dataclass
class SchemaOrgRecipe:
    """Recipe data as extracted from schema.org JSON-LD."""
    
    # Required fields
    name: str
    url: str
    
    # Optional fields
    description: Optional[str] = None
    recipe_yield: Optional[str] = None
    total_time: Optional[str] = None  # ISO 8601 duration
    cook_time: Optional[str] = None
    prep_time: Optional[str] = None
    cuisine: Optional[str] = None
    category: Optional[str] = None
    keywords: Optional[str] = None
    author: Optional[str] = None
    date_published: Optional[str] = None
    
    # Lists
    ingredients: list[str] = field(default_factory=list)
    instructions: list[str] = field(default_factory=list)
    images: list[ImageInfo] = field(default_factory=list)
    diet_types: list[str] = field(default_factory=list)
    
    # Nested
    nutrition: Optional[NutritionInfo] = None
    
    # Rating
    rating_value: Optional[float] = None
    rating_count: Optional[int] = None


@dataclass
class Ingredient:
    """Parsed ingredient for JOAv0 format."""
    id: str
    name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None
    note: Optional[str] = None
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "name": self.name,
            "quantity": self.quantity,
            "unit": self.unit,
            "note": self.note
        }


@dataclass
class OnEnter:
    """Step entry actions."""
    say: str
    
    def to_dict(self) -> dict:
        return {"say": self.say}


@dataclass
class Step:
    """Cooking step in JOAv0 format."""
    id: str
    descr: str
    instructions: str
    type: StepType = StepType.IMMEDIATE
    auto_start: bool = False
    requires_confirm: bool = True
    duration: Optional[int] = None  # seconds
    depends_on: list[str] = field(default_factory=list)
    next: list[str] = field(default_factory=list)
    on_enter: Optional[OnEnter] = None
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        result = {
            "id": self.id,
            "descr": self.descr,
            "instructions": self.instructions,
            "type": self.type.value,
            "auto_start": self.auto_start,
            "requires_confirm": self.requires_confirm,
        }
        
        if self.duration:
            result["duration"] = f"PT{self.duration}S"
        if self.depends_on:
            result["depends_on"] = self.depends_on
        if self.next:
            result["next"] = self.next
        if self.on_enter:
            result["on_enter"] = [self.on_enter.to_dict()]
        
        return result


@dataclass 
class JOAv0Recipe:
    """Complete recipe in JOAv0 format."""
    
    # Recipe metadata
    id: str
    title: str
    servings: int = 4
    estimated_total: Optional[str] = None  # ISO 8601
    difficulty: str = "not-too-tricky"
    locale: str = "en"
    description: Optional[str] = None
    tags: list[str] = field(default_factory=list)
    course: Optional[str] = None
    cuisine: Optional[str] = None
    source: str = "jamieoliver.com"
    source_url: Optional[str] = None
    
    # Images
    images: list[str] = field(default_factory=list)  # CDN URLs
    
    # Nutrition
    nutrition: Optional[NutritionInfo] = None
    
    # Recipe content
    ingredients: list[Ingredient] = field(default_factory=list)
    utensils: list[str] = field(default_factory=list)
    steps: list[Step] = field(default_factory=list)
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        recipe_meta = {
            "id": self.id,
            "title": self.title,
            "servings": self.servings,
            "difficulty": self.difficulty,
            "locale": self.locale,
            "source": self.source,
        }
        
        if self.estimated_total:
            recipe_meta["estimated_total"] = self.estimated_total
        if self.description:
            recipe_meta["description"] = self.description
        if self.tags:
            recipe_meta["tags"] = self.tags
        if self.course:
            recipe_meta["course"] = self.course
        if self.cuisine:
            recipe_meta["cuisine"] = self.cuisine
        if self.source_url:
            recipe_meta["source_url"] = self.source_url
        if self.images:
            recipe_meta["images"] = self.images
        
        result = {
            "recipe": recipe_meta,
            "ingredients": [i.to_dict() for i in self.ingredients],
            "utensils": self.utensils,
            "steps": [s.to_dict() for s in self.steps],
        }
        
        if self.nutrition:
            result["nutrition"] = {
                "calories": self.nutrition.calories,
                "carbohydrates": self.nutrition.carbohydrates,
                "fat": self.nutrition.fat,
                "fiber": self.nutrition.fiber,
                "protein": self.nutrition.protein,
            }
        
        return result
