from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class RecipeMeta(BaseModel):
    title: str
    estimated_total: Optional[str] = Field(
        default=None, description="ISO-8601 duration, e.g., PT20M"
    )
    servings: Optional[int] = None
    difficulty: Optional[str] = None
    locale: Optional[str] = "en"
    source: Optional[str] = "pdf"


class Ingredient(BaseModel):
    name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None


class Step(BaseModel):
    id: str
    descr: str
    instructions: str
    type: str = "immediate"
    auto_start: bool = False
    requires_confirm: bool = False


class Notes(BaseModel):
    text: str = ""


class RecipeDoc(BaseModel):
    recipe: RecipeMeta
    ingredients: List[Ingredient]
    utensils: List[str] = []
    steps: List[Step]
    notes: Notes = Notes()

