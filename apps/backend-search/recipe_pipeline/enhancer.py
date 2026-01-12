"""
Recipe Enhancer

Uses LLM to enhance recipe JSONs with:
- Semantic step IDs
- Warm, conversational on_enter.say messages
- Timer detection and duration extraction
- requires_confirm flags
"""

import json
import logging
import os
import re
from typing import Any

from openai import OpenAI

logger = logging.getLogger(__name__)


class RecipeEnhancer:
    """Enhances recipe JSONs using LLM."""
    
    SYSTEM_PROMPT = """You are a recipe enhancement assistant for Jamie Oliver AI.

Your job is to enhance recipe JSON data to make it work perfectly with a voice-guided cooking assistant.

## Rules for Enhancement

### 1. STEP IDs
Convert generic step IDs (step_1, step_2) to semantic, descriptive IDs:
- GOOD: "preheat_oven", "sear_chicken", "rest_meat", "make_sauce", "plate_dish"
- BAD: "step_1", "step_2", "step_3"

Use snake_case, be descriptive, keep them short (2-4 words max).

### 2. ON_ENTER.SAY Messages
Write warm, encouraging instructions as if Jamie Oliver is speaking directly to the user.
- Use "we", "let's", "you" - make it conversational
- Be encouraging and positive
- Include helpful tips
- Mention sensory cues (what it should look like, smell like, sound like)

GOOD examples:
- "Right, let's get this beautiful risotto started! First, heat up your pan over medium heat until it's nice and hot."
- "Now this is the fun part - we're going to sear this chicken until it's got that gorgeous golden colour. You'll hear it sizzle!"
- "Brilliant! Let that rest for about 5 minutes. This is really important - it lets all those lovely juices redistribute."

BAD examples:
- "Heat pan." (too short)
- "Proceed to the next step." (not helpful)
- "Cook the chicken." (too generic)

### 3. TIMER STEPS
When a step involves waiting (baking, simmering, resting, etc.):
- Set type: "timer"
- Include duration in seconds
- Set auto_start: true if the timer should start automatically
- Extract the duration from the instruction text

Examples of timer steps:
- "Bake for 20 minutes" → type: "timer", duration: 1200, auto_start: true
- "Let it rest for 5 minutes" → type: "timer", duration: 300
- "Simmer for 30 minutes" → type: "timer", duration: 1800

For non-timer steps, use type: "immediate"

### 4. REQUIRES_CONFIRM
Set requires_confirm: true for steps where:
- User needs to complete an action before moving on
- There's active cooking involved
- User needs to check if something is done

Set requires_confirm: false only for informational steps or automatic transitions.

## Output Format

Return ONLY valid JSON - no markdown, no explanation, no code blocks.
The JSON should be the complete enhanced recipe in JOAv0 format.
"""

    def __init__(self, model: str = "gpt-4o"):
        """Initialize enhancer with OpenAI client."""
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model = model
    
    def enhance(self, recipe_json: dict) -> dict:
        """
        Enhance a recipe JSON with LLM.
        
        Args:
            recipe_json: Original JOAv0 recipe document
            
        Returns:
            Enhanced JOAv0 recipe document
        """
        logger.info(f"Enhancing recipe: {recipe_json.get('recipe', {}).get('title', 'Unknown')}")
        
        # Build the prompt with the recipe
        user_prompt = self._build_user_prompt(recipe_json)
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.3,  # Lower temperature for more consistent output
                max_tokens=4000,
            )
            
            content = response.choices[0].message.content
            enhanced = json.loads(content)
            
            # Validate the response has required fields
            if not enhanced.get("recipe") or not enhanced.get("steps"):
                logger.error("LLM response missing required fields")
                return recipe_json  # Return original if enhancement failed
            
            logger.info(f"Successfully enhanced recipe with {len(enhanced.get('steps', []))} steps")
            return enhanced
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {e}")
            return recipe_json
        except Exception as e:
            logger.error(f"Enhancement failed: {e}")
            return recipe_json
    
    def enhance_step_only(self, step: dict, recipe_context: dict) -> dict:
        """
        Enhance a single step (useful for incremental enhancement).
        
        Args:
            step: Single step object
            recipe_context: Recipe metadata for context
            
        Returns:
            Enhanced step object
        """
        prompt = f"""Enhance this single recipe step for "{recipe_context.get('title', 'Unknown Recipe')}":

Current step:
{json.dumps(step, indent=2)}

Apply the enhancement rules and return ONLY the enhanced step as JSON."""
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.3,
            )
            
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            logger.error(f"Step enhancement failed: {e}")
            return step
    
    def _build_user_prompt(self, recipe_json: dict) -> str:
        """Build the user prompt for enhancement."""
        return f"""Please enhance this recipe JSON. Apply all the enhancement rules:
1. Convert generic step IDs to semantic ones
2. Add warm, Jamie Oliver-style on_enter.say messages
3. Detect timer steps and add duration
4. Set appropriate requires_confirm flags

Here's the recipe to enhance:

{json.dumps(recipe_json, indent=2)}

Return the complete enhanced recipe as JSON."""
    
    def quick_fix_step_ids(self, recipe_json: dict) -> dict:
        """
        Quick deterministic fix for step IDs without LLM.
        Useful as a fallback or for simple cases.
        """
        recipe = recipe_json.copy()
        steps = recipe.get("steps", [])
        
        for i, step in enumerate(steps):
            step_id = step.get("step_id", "")
            if self._is_generic_step_id(step_id):
                # Generate a semantic ID from the instruction
                instruction = step.get("on_enter", {}).get("say", "") or step.get("instruction", "")
                new_id = self._generate_step_id(instruction, i)
                step["step_id"] = new_id
        
        recipe["steps"] = steps
        return recipe
    
    def _is_generic_step_id(self, step_id: str) -> bool:
        """Check if step_id is generic."""
        if not step_id:
            return True
        return bool(re.match(r"^step[_-]?\d+$", step_id.lower()))
    
    def _generate_step_id(self, instruction: str, index: int) -> str:
        """Generate a semantic step ID from instruction text."""
        # Extract key action words
        instruction = instruction.lower()
        
        # Common cooking actions
        actions = [
            ("preheat", "preheat"),
            ("heat", "heat"),
            ("chop", "chop"),
            ("dice", "dice"),
            ("slice", "slice"),
            ("mix", "mix"),
            ("stir", "stir"),
            ("add", "add"),
            ("pour", "pour"),
            ("bake", "bake"),
            ("roast", "roast"),
            ("fry", "fry"),
            ("sear", "sear"),
            ("simmer", "simmer"),
            ("boil", "boil"),
            ("grill", "grill"),
            ("rest", "rest"),
            ("serve", "serve"),
            ("plate", "plate"),
            ("season", "season"),
            ("marinate", "marinate"),
            ("blend", "blend"),
            ("whisk", "whisk"),
        ]
        
        # Find action
        action = None
        for keyword, action_name in actions:
            if keyword in instruction:
                action = action_name
                break
        
        if not action:
            action = "prepare"
        
        # Extract object (simple heuristic)
        words = instruction.split()
        obj = ""
        for word in words:
            if len(word) > 4 and word not in ["about", "until", "while", "after", "before"]:
                obj = word[:8]  # Truncate long words
                break
        
        if obj:
            return f"{action}_{obj}_{index + 1}"
        return f"{action}_step_{index + 1}"
    
    def extract_timer_duration(self, text: str) -> int | None:
        """
        Extract timer duration in seconds from text.
        
        Examples:
            "bake for 20 minutes" -> 1200
            "simmer for 1 hour" -> 3600
            "rest for 5-10 minutes" -> 450 (average)
        """
        text = text.lower()
        
        # Patterns for time extraction
        patterns = [
            # "20 minutes", "20 mins", "20min"
            (r"(\d+)\s*(?:minutes?|mins?)", lambda m: int(m.group(1)) * 60),
            # "1 hour", "2 hours"
            (r"(\d+)\s*(?:hours?|hrs?)", lambda m: int(m.group(1)) * 3600),
            # "30 seconds"
            (r"(\d+)\s*(?:seconds?|secs?)", lambda m: int(m.group(1))),
            # "5-10 minutes" (range - take average)
            (r"(\d+)\s*-\s*(\d+)\s*(?:minutes?|mins?)", 
             lambda m: ((int(m.group(1)) + int(m.group(2))) // 2) * 60),
            # "1.5 hours"
            (r"(\d+\.?\d*)\s*(?:hours?|hrs?)", lambda m: int(float(m.group(1)) * 3600)),
        ]
        
        for pattern, converter in patterns:
            match = re.search(pattern, text)
            if match:
                try:
                    return converter(match)
                except (ValueError, IndexError):
                    continue
        
        return None
