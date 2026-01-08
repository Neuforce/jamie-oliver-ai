from __future__ import annotations

import logging
from typing import Optional

try:
    from langchain_core.output_parsers import PydanticOutputParser  # LC >= 0.2
    from langchain_core.prompts import PromptTemplate
except ImportError:
    from langchain.output_parsers import PydanticOutputParser  # LC < 0.2
    from langchain.prompts import PromptTemplate
from langchain_ollama import OllamaLLM as Ollama
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class SectionDoc(BaseModel):
    meta: str
    ingredients: str
    method: str
    notes: str


FORMAT_SECTIONS = (
    'Return exactly a JSON object with keys: "meta", "ingredients", "method", "notes". '
    'Each value must be a string. No other keys. Example: '
    '{"meta": "Title...\\nTime...\\nDifficulty...\\nServes...", "ingredients": "line1\\nline2", '
    '"method": "1 step\\n2 step", "notes": "optional notes"}'
)

SECTIONS_PROMPT = """
You will segment the raw recipe text into four parts: meta, ingredients, method, notes.
{format_instructions}

Rules:
- Do NOT invent content; copy relevant text for each section.
- meta: title, time, difficulty, servings; keep concise.
- ingredients: only the ingredient list (no steps).
- method: only the instructions/steps (numbered if present).
- notes: tips or extra notes if present, else empty string.

RAW_TEXT:
{raw_text}
"""


def detect_sections(
    *,
    raw_text: str,
    model: str = "llama3.1",
    temperature: float = 0.0,
    num_ctx: int = 4096,
) -> Optional[SectionDoc]:
    parser = PydanticOutputParser(pydantic_object=SectionDoc)
    prompt = PromptTemplate(
        template=SECTIONS_PROMPT,
        input_variables=["raw_text"],
        partial_variables={"format_instructions": FORMAT_SECTIONS},
    )
    llm = Ollama(model=model, temperature=temperature, num_ctx=num_ctx)
    try:
        chain = prompt | llm | parser
        return chain.invoke({"raw_text": raw_text})
    except Exception as e:
        logger.warning("Section detection failed: %s", e)
        return None

