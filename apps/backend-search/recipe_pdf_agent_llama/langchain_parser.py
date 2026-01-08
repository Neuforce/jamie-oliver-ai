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

from recipe_pdf_agent_llama.langchain_models import RecipeDoc

logger = logging.getLogger(__name__)


LANGCHAIN_PROMPT = """
You are an expert recipe parser. Given the raw recipe text extracted from a PDF, produce a structured JSON.

Output MUST strictly follow this Pydantic schema:
{format_instructions}

Rules:
- Preserve all ingredients as separate items; keep quantity/unit if present.
- Steps must be in order and non-empty; set type="immediate", auto_start=false, requires_confirm=false unless a timer is explicit.
- estimated_total should be ISO-8601 duration (e.g., PT20M) if parsable, else null.
- If data is missing, use null/empty string, but keep schema valid.
- locale='en', source='pdf'.

RAW_TEXT:
{raw_text}
"""


def parse_with_langchain_ollama(
    *,
    raw_text: str,
    model: str = "llama3.1",
    temperature: float = 0.0,
    num_ctx: int = 4096,
) -> Optional[RecipeDoc]:
    """
    Use LangChain + Ollama + PydanticOutputParser to parse raw text into RecipeDoc.
    """
    parser = PydanticOutputParser(pydantic_object=RecipeDoc)
    prompt = PromptTemplate(
        template=LANGCHAIN_PROMPT,
        input_variables=["raw_text"],
        partial_variables={"format_instructions": parser.get_format_instructions()},
    )
    llm = Ollama(model=model, temperature=temperature, num_ctx=num_ctx)
    try:
        chain = prompt | llm | parser
        return chain.invoke({"raw_text": raw_text})
    except Exception as e:
        logger.warning("LangChain parser failed: %s", e)
        return None

