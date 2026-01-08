from enum import Enum
from typing import Literal, Optional, Dict, List, Any
from pydantic import BaseModel, Field


class Role(str, Enum):
    system = "system"
    assistant = "assistant"
    user = "user"
    tool = "tool"


class BaseMessage(BaseModel):
    role: Role
    content: Optional[str] = None


class SystemMessage(BaseMessage):
    role: Literal[Role.system] = Role.system


class UserMessage(BaseMessage):
    role: Literal[Role.user] = Role.user


class Function(BaseModel):
    name: str
    arguments: str


class ToolCall(BaseModel):
    id: str
    type: Literal["function"] = "function"
    function: Function


class AssistantMessage(BaseMessage):
    role: Literal[Role.assistant] = Role.assistant
    content: Optional[str] = None
    tool_calls: Optional[List[ToolCall]] = None


class ToolMessage(BaseMessage):
    role: Literal[Role.tool] = Role.tool
    content: str
    tool_call_id: str
    function_name: str


Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage
