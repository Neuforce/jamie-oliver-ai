from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Any
from pydantic import BaseModel
from ccai.core.function_manager.models import FunctionRegistry
from ccai.core.messages.base import BaseMessage as Message


class LLMResponse(BaseModel):
    pass


class ChunkResponse(LLMResponse):
    content: str


class FunctionCallResponse(LLMResponse):
    function_name: str
    arguments: Dict[str, Any]
    tool_call_id: Optional[str]


class BaseLLM(ABC):
    @abstractmethod
    async def invoke(
            self, messages: List[Message], function_registry: FunctionRegistry
    ):
        pass
