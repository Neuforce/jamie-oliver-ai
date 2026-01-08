from __future__ import annotations

import logging
from typing import List, Optional

try:
    from langchain_core.output_parsers import PydanticOutputParser  # LC >= 0.2
    from langchain_core.prompts import PromptTemplate
except ImportError:
    from langchain.output_parsers import PydanticOutputParser  # LC < 0.2
    from langchain.prompts import PromptTemplate
from langchain_ollama import OllamaLLM as Ollama
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class IngredientItem(BaseModel):
    name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None


class IngredientList(BaseModel):
    ingredients: List[IngredientItem]


class StepItem(BaseModel):
    id: str
    descr: str
    instructions: str
    type: str = "immediate"
    auto_start: bool = False
    requires_confirm: bool = False


class StepList(BaseModel):
    steps: List[StepItem]


ING_PROMPT = """
Extract a clean ingredient list from the provided text.
Return ONLY JSON following this schema:
{format_instructions}

Rules:
- One ingredient per entry.
- Keep quantity/unit if present; else null.
- Do NOT include steps or directions.

INGREDIENT_TEXT:
{ingredients_text}
"""


STEP_PROMPT = """
Extract ordered cooking steps from the provided method text.
Return ONLY JSON following this schema:
{format_instructions}

Rules:
- Preserve order; split by numbering if present.
- Each step must have descr and instructions (same text is fine).
- type='immediate', auto_start=false, requires_confirm=false unless a timer is explicit.
- Do NOT include ingredient lists.

METHOD_TEXT:
{method_text}
"""


def parse_ingredients_block(
    *,
    ingredients_text: str,
    model: str = "llama3.1",
    temperature: float = 0.0,
    num_ctx: int = 4096,
) -> Optional[IngredientList]:
    parser = PydanticOutputParser(pydantic_object=IngredientList)
    prompt = PromptTemplate(
        template=ING_PROMPT,
        input_variables=["ingredients_text"],
        partial_variables={"format_instructions": parser.get_format_instructions()},
    )
    llm = Ollama(model=model, temperature=temperature, num_ctx=num_ctx)
    try:
        chain = prompt | llm | parser
        return chain.invoke({"ingredients_text": ingredients_text})
    except Exception as e:
        logger.warning("Ingredient parse failed: %s", e)
        return None


def parse_steps_block(
    *,
    method_text: str,
    model: str = "llama3.1",
    temperature: float = 0.0,
    num_ctx: int = 4096,
) -> Optional[StepList]:
    parser = PydanticOutputParser(pydantic_object=StepList)
    prompt = PromptTemplate(
        template=STEP_PROMPT,
        input_variables=["method_text"],
        partial_variables={"format_instructions": parser.get_format_instructions()},
    )
    llm = Ollama(model=model, temperature=temperature, num_ctx=num_ctx)
    try:
        chain = prompt | llm | parser
        return chain.invoke({"method_text": method_text})
    except Exception as e:
        logger.warning("Step parse failed: %s", e)
        return None

