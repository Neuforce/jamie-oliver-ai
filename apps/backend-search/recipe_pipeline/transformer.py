"""
Recipe Transformer

Converts schema.org/Recipe format to JOAv0 format used by the voice-guided cooking assistant.
"""

import logging
import re
from typing import Optional

from .models import (
    Ingredient,
    JOAv0Recipe,
    OnEnter,
    SchemaOrgRecipe,
    Step,
    StepType,
)

logger = logging.getLogger(__name__)


class TransformError(Exception):
    """Error during recipe transformation."""
    pass


class SchemaOrgToJOAv0Transformer:
    """
    Transforms schema.org/Recipe data to JOAv0 format.
    
    The transformer handles:
    - Generating slugified IDs
    - Parsing ingredients from text
    - Converting sequential steps to JOAv0 step format
    - Extracting timing information
    """
    
    # Common units for ingredient parsing
    UNITS = {
        # Volume
        "cup", "cups", "c",
        "tablespoon", "tablespoons", "tbsp", "tbs", "tb",
        "teaspoon", "teaspoons", "tsp", "ts",
        "ml", "milliliter", "milliliters", "millilitre", "millilitres",
        "l", "liter", "liters", "litre", "litres",
        "fl oz", "fluid ounce", "fluid ounces",
        "pint", "pints", "pt",
        "quart", "quarts", "qt",
        "gallon", "gallons", "gal",
        # Weight
        "g", "gram", "grams",
        "kg", "kilogram", "kilograms",
        "oz", "ounce", "ounces",
        "lb", "lbs", "pound", "pounds",
        # Count
        "whole", "piece", "pieces", "slice", "slices",
        "clove", "cloves", "sprig", "sprigs",
        "bunch", "bunches", "handful", "handfuls",
        "stick", "sticks", "stalk", "stalks",
        "can", "cans", "tin", "tins",
        "bag", "bags", "packet", "packets",
        "pinch", "pinches", "dash", "dashes",
    }
    
    # Common cooking actions for step ID generation
    COOKING_ACTIONS = [
        "preheat", "heat", "warm",
        "chop", "dice", "slice", "mince", "julienne", "cube",
        "mix", "stir", "combine", "whisk", "beat", "fold",
        "add", "pour", "drizzle", "sprinkle",
        "bake", "roast", "grill", "broil", "fry", "sauté", "sear",
        "boil", "simmer", "steam", "poach", "blanch",
        "marinate", "season", "coat", "dredge",
        "rest", "cool", "chill", "refrigerate",
        "serve", "plate", "garnish", "top",
        "blend", "puree", "process", "mash",
        "strain", "drain", "rinse",
        "knead", "roll", "shape", "form",
        "toast", "brown", "caramelize", "char",
    ]
    
    def transform(self, schema_recipe: SchemaOrgRecipe) -> JOAv0Recipe:
        """
        Transform a schema.org recipe to JOAv0 format.
        
        Args:
            schema_recipe: Recipe in schema.org format
            
        Returns:
            Recipe in JOAv0 format (basic structure, needs LLM enhancement)
        """
        logger.info(f"Transforming recipe: {schema_recipe.name}")
        
        # Generate recipe ID (slug)
        recipe_id = self._generate_slug(schema_recipe.name)
        
        # Parse servings
        servings = self._parse_servings(schema_recipe.recipe_yield)
        
        # Parse ingredients
        ingredients = [
            self._parse_ingredient(ing, i) 
            for i, ing in enumerate(schema_recipe.ingredients)
        ]
        
        # Convert steps (basic conversion, LLM enhancement needed later)
        steps = [
            self._convert_step(inst, i, len(schema_recipe.instructions))
            for i, inst in enumerate(schema_recipe.instructions)
        ]
        
        # Link steps sequentially for now (LLM can add parallelism later)
        for i, step in enumerate(steps):
            if i > 0:
                step.depends_on = [steps[i - 1].id]
            if i < len(steps) - 1:
                step.next = [steps[i + 1].id]
        
        # Extract utensils from instructions (basic heuristic)
        utensils = self._extract_utensils(schema_recipe.instructions)
        
        # Map course from category
        course = self._map_course(schema_recipe.category)
        
        # Map cuisine
        cuisine = self._slugify(schema_recipe.cuisine) if schema_recipe.cuisine else None
        
        # Combine tags
        tags = list(schema_recipe.diet_types)
        if schema_recipe.keywords:
            keyword_tags = [
                self._slugify(k.strip()) 
                for k in schema_recipe.keywords.split(",")
                if k.strip()
            ]
            tags.extend(keyword_tags)
        
        # Build image URLs
        image_urls = [img.url for img in schema_recipe.images if img.url]
        
        return JOAv0Recipe(
            id=recipe_id,
            title=schema_recipe.name,
            servings=servings,
            estimated_total=schema_recipe.total_time,
            description=schema_recipe.description,
            tags=list(set(tags)),  # dedupe
            course=course,
            cuisine=cuisine,
            source="jamieoliver.com",
            source_url=schema_recipe.url,
            images=image_urls,
            nutrition=schema_recipe.nutrition,
            ingredients=ingredients,
            utensils=utensils,
            steps=steps,
        )
    
    def _generate_slug(self, title: str) -> str:
        """Generate URL-friendly slug from title."""
        slug = title.lower()
        # Replace special chars with space
        slug = re.sub(r"[^a-z0-9\s-]", " ", slug)
        # Replace multiple spaces/dashes with single dash
        slug = re.sub(r"[\s-]+", "-", slug)
        # Remove leading/trailing dashes
        slug = slug.strip("-")
        return slug
    
    def _slugify(self, text: str) -> str:
        """Convert text to slug format."""
        if not text:
            return ""
        return self._generate_slug(text)
    
    def _parse_servings(self, recipe_yield: Optional[str]) -> int:
        """Parse servings from recipe yield string."""
        if not recipe_yield:
            return 4  # default
        
        # Try to extract number
        match = re.search(r"(\d+)", str(recipe_yield))
        if match:
            return int(match.group(1))
        
        return 4  # default
    
    def _parse_ingredient(self, text: str, index: int) -> Ingredient:
        """
        Parse ingredient text into structured Ingredient.
        
        Examples:
            "2 cups flour" -> Ingredient(quantity=2, unit="cups", name="flour")
            "1 x 500g bag of mushrooms" -> Ingredient(quantity=500, unit="g", name="mushrooms")
            "salt to taste" -> Ingredient(name="salt", note="to taste")
        """
        text = text.strip()
        original_text = text
        
        # Extract quantity (number at start)
        quantity = None
        quantity_match = re.match(
            r"^([\d./]+(?:\s*-\s*[\d./]+)?)\s*(?:x\s*)?", 
            text, 
            re.IGNORECASE
        )
        if quantity_match:
            try:
                qty_str = quantity_match.group(1)
                # Handle fractions
                if "/" in qty_str:
                    parts = qty_str.split("/")
                    quantity = float(parts[0]) / float(parts[1])
                elif "-" in qty_str:
                    # Range - take average
                    parts = qty_str.split("-")
                    quantity = (float(parts[0].strip()) + float(parts[1].strip())) / 2
                else:
                    quantity = float(qty_str)
                text = text[quantity_match.end():].strip()
            except (ValueError, IndexError):
                pass
        
        # Handle "1 x 500g" pattern
        x_match = re.match(r"^(\d+)\s*(?:g|kg|ml|l)\b", text, re.IGNORECASE)
        if x_match:
            try:
                quantity = float(x_match.group(1))
            except ValueError:
                pass
        
        # Extract unit
        unit = None
        text_lower = text.lower()
        for u in sorted(self.UNITS, key=len, reverse=True):
            pattern = rf"^{re.escape(u)}(?:\s+|$)"
            if re.match(pattern, text_lower):
                unit = u
                text = text[len(u):].strip()
                break
        
        # Handle "of" prefix (e.g., "of butter")
        if text.lower().startswith("of "):
            text = text[3:].strip()
        
        # Extract note (text in parentheses or after comma)
        note = None
        paren_match = re.search(r"\(([^)]+)\)", text)
        if paren_match:
            note = paren_match.group(1).strip()
            text = re.sub(r"\s*\([^)]+\)\s*", " ", text).strip()
        
        comma_match = re.search(r",\s*(.+)$", text)
        if comma_match:
            note_part = comma_match.group(1).strip()
            if note:
                note = f"{note}, {note_part}"
            else:
                note = note_part
            text = text[:comma_match.start()].strip()
        
        # Remaining text is the ingredient name
        name = text.strip() or original_text
        
        # Generate ID
        ing_id = self._slugify(name)[:30] or f"ingredient_{index}"
        
        return Ingredient(
            id=ing_id,
            name=name,
            quantity=quantity,
            unit=unit,
            note=note
        )
    
    def _convert_step(self, instruction: str, index: int, total_steps: int) -> Step:
        """
        Convert instruction text to Step.
        
        Args:
            instruction: Step instruction text
            index: Step index (0-based)
            total_steps: Total number of steps
            
        Returns:
            Step object (basic, needs LLM enhancement for TTS text)
        """
        # Generate step ID based on content
        step_id = self._generate_step_id(instruction, index)
        
        # Generate short description (first sentence or first 60 chars)
        descr = self._generate_step_description(instruction)
        
        # Detect if this is a timer step
        step_type = StepType.IMMEDIATE
        duration = None
        timer_duration = self._extract_timer_duration(instruction)
        if timer_duration:
            step_type = StepType.TIMER
            duration = timer_duration
        
        # First step auto-starts
        auto_start = (index == 0)
        
        # Last step doesn't require confirm
        requires_confirm = (index < total_steps - 1)
        
        # Create basic on_enter (will be enhanced by LLM)
        on_enter = OnEnter(say=instruction)
        
        return Step(
            id=step_id,
            descr=descr,
            instructions=instruction,
            type=step_type,
            auto_start=auto_start,
            requires_confirm=requires_confirm,
            duration=duration,
            on_enter=on_enter,
        )
    
    def _generate_step_id(self, instruction: str, index: int) -> str:
        """Generate semantic step ID from instruction text."""
        text = instruction.lower()
        
        # Find the first cooking action
        action = None
        for act in self.COOKING_ACTIONS:
            if act in text:
                action = act
                break
        
        if not action:
            action = "step"
        
        # Extract key noun (simple heuristic: first noun-like word after action)
        obj = ""
        if action in text:
            after_action = text.split(action, 1)[1][:50] if action in text else ""
            words = re.findall(r"\b[a-z]{4,}\b", after_action)
            stop_words = {"the", "into", "until", "about", "with", "from", "then", "this"}
            for word in words:
                if word not in stop_words and word not in self.COOKING_ACTIONS:
                    obj = word
                    break
        
        if obj:
            return f"{action}_{obj}"
        else:
            return f"{action}_step_{index + 1}"
    
    def _generate_step_description(self, instruction: str) -> str:
        """Generate short description for step."""
        # Take first sentence or first 60 chars
        sentences = re.split(r"[.!?]", instruction)
        first_sentence = sentences[0].strip() if sentences else instruction
        
        if len(first_sentence) <= 60:
            return first_sentence
        
        # Truncate at word boundary
        truncated = first_sentence[:57]
        last_space = truncated.rfind(" ")
        if last_space > 30:
            truncated = truncated[:last_space]
        return truncated + "..."
    
    def _extract_timer_duration(self, text: str) -> Optional[int]:
        """
        Extract timer duration in seconds from instruction text.
        
        Examples:
            "bake for 20 minutes" -> 1200
            "simmer for 1 hour" -> 3600
            "rest for 5-10 minutes" -> 450 (average)
        """
        text = text.lower()
        
        patterns = [
            # "20 minutes", "20 mins"
            (r"(\d+)\s*(?:minutes?|mins?)", lambda m: int(m.group(1)) * 60),
            # "1 hour", "2 hours"
            (r"(\d+)\s*(?:hours?|hrs?)", lambda m: int(m.group(1)) * 3600),
            # "30 seconds"
            (r"(\d+)\s*(?:seconds?|secs?)", lambda m: int(m.group(1))),
            # "5-10 minutes" (range)
            (r"(\d+)\s*-\s*(\d+)\s*(?:minutes?|mins?)",
             lambda m: ((int(m.group(1)) + int(m.group(2))) // 2) * 60),
            # "1.5 hours"
            (r"(\d+\.?\d*)\s*(?:hours?|hrs?)",
             lambda m: int(float(m.group(1)) * 3600)),
        ]
        
        for pattern, converter in patterns:
            match = re.search(pattern, text)
            if match:
                try:
                    return converter(match)
                except (ValueError, IndexError):
                    continue
        
        return None
    
    def _extract_utensils(self, instructions: list[str]) -> list[str]:
        """Extract cooking utensils mentioned in instructions."""
        utensils = set()
        
        # Common utensils to look for
        utensil_patterns = [
            "oven", "baking tray", "baking sheet", "roasting tin",
            "frying pan", "saucepan", "pot", "pan", "skillet", "wok",
            "bowl", "mixing bowl", "large bowl",
            "knife", "sharp knife", "chopping board", "cutting board",
            "blender", "food processor", "mixer", "whisk",
            "sieve", "strainer", "colander",
            "wooden spoon", "spatula", "ladle", "slotted spoon",
            "grater", "peeler", "zester",
            "measuring cup", "measuring spoon",
            "baking dish", "casserole dish",
            "grill", "griddle", "broiler",
        ]
        
        combined_text = " ".join(instructions).lower()
        
        for utensil in utensil_patterns:
            if utensil in combined_text:
                # Capitalize properly
                utensils.add(utensil)
        
        return sorted(list(utensils))
    
    def _map_course(self, category: Optional[str]) -> Optional[str]:
        """Map recipe category to course type."""
        if not category:
            return None
        
        category_lower = category.lower()
        
        course_mapping = {
            "breakfast": "breakfast",
            "brunch": "breakfast",
            "lunch": "main",
            "dinner": "main",
            "main": "main",
            "starter": "starter",
            "appetizer": "starter",
            "side": "side",
            "dessert": "dessert",
            "cake": "dessert",
            "sweet": "dessert",
            "snack": "snack",
            "drink": "beverage",
            "beverage": "beverage",
            "cocktail": "beverage",
            "soup": "starter",
            "salad": "side",
        }
        
        for key, value in course_mapping.items():
            if key in category_lower:
                return value
        
        return "main"  # default


# Convenience function
def transform_recipe(schema_recipe: SchemaOrgRecipe) -> JOAv0Recipe:
    """
    Transform a schema.org recipe to JOAv0 format.
    
    Args:
        schema_recipe: Recipe in schema.org format
        
    Returns:
        Recipe in JOAv0 format
    """
    transformer = SchemaOrgToJOAv0Transformer()
    return transformer.transform(schema_recipe)
