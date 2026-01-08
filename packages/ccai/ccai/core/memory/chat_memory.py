from typing import List
from .base import BaseChatMemory
from ccai.core.messages.base import (
    Message,
    SystemMessage,
    UserMessage,
    AssistantMessage,
    ToolMessage,
    ToolCall,
)


class SimpleChatMemory(BaseChatMemory):
    def __init__(self):
        self.history: List[Message] = []

    def add_system_message(self, content: str):
        self.history.append(SystemMessage(content=content))

    def add_assistant_message(self, content: str, tool_calls: List[ToolCall] = None):
        self.history.append(AssistantMessage(content=content, tool_calls=tool_calls))

    def add_user_message(self, content: str):
        self.history.append(UserMessage(content=content))

    def add_tool_message(self, content: str, tool_call_id: str, function_name: str):
        self.history.append(
            ToolMessage(
                content=content, tool_call_id=tool_call_id, function_name=function_name
            )
        )

    def get_messages(self) -> List[Message]:
        return self.history

    def clear_history(self):
        self.history.clear()
