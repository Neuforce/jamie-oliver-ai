from abc import ABC, abstractmethod
from typing import List
from ccai.core.messages import Message
from ccai.core.messages.base import ToolCall


class BaseChatMemory(ABC):
    @abstractmethod
    def add_system_message(self, content: str):
        pass

    @abstractmethod
    def add_assistant_message(self, content: str, tool_calls: List[ToolCall] = None):
        pass

    @abstractmethod
    def add_user_message(self, content: str):
        pass

    @abstractmethod
    def add_tool_message(self, content: str, tool_call_id: str, function_name: str):
        pass

    @abstractmethod
    def get_messages(self) -> List[Message]:
        pass

    @abstractmethod
    def clear_history(self):
        pass
