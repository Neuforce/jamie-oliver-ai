import json
from typing import List, Dict, Any, AsyncGenerator, Optional
from ccai.core.function_manager.models import RegisteredFunction, FunctionRegistry
from ccai.core.llm.base import BaseLLM, LLMResponse, ChunkResponse, FunctionCallResponse
from ccai.core.messages import Message
from ccai.core.utils import map_python_type_to_json_schema


class GroqLLM(BaseLLM):
    def __init__(
            self,
            api_key: str,
            model: str = "llama-3.1-70b-versatile",
            temperature: float = 0.0,
    ):
        try:
            import groq
        except ImportError:
            raise ImportError(
                "Please install the Groq Python package by running 'pip install groq'."
            )

        self.client = groq.AsyncClient(api_key=api_key)
        self.model = model
        self.temperature = temperature

    async def invoke(
            self, messages: List[Message], function_registry: FunctionRegistry
    ) -> AsyncGenerator[LLMResponse, None]:
        transformed_messages = await self._transform_messages(messages)
        function_schema = self._generate_function_schemas(function_registry)

        chat_completion = await self.client.chat.completions.create(
            model=self.model,
            temperature=self.temperature,
            messages=transformed_messages,
            tools=function_schema,
            stream=True,
        )

        current_function: Optional[Dict[str, Any]] = None

        async for chunk in chat_completion:
            delta = chunk.choices[0].delta

            if delta.content:
                yield ChunkResponse(content=delta.content)

            elif delta.tool_calls:
                for tool_call in delta.tool_calls:
                    if tool_call.function.name:
                        if current_function:
                            yield self._create_function_call_response(current_function)

                        current_function = {
                            "name": tool_call.function.name,
                            "arguments": "",
                            "tool_call_id": tool_call.id,
                        }

                    if tool_call.function.arguments:
                        current_function["arguments"] += tool_call.function.arguments
                        try:
                            # Attempt to parse the accumulated JSON
                            parsed_args = json.loads(current_function["arguments"])
                            yield self._create_function_call_response(
                                {
                                    "name": current_function["name"],
                                    "arguments": json.dumps(parsed_args),
                                    "tool_call_id": current_function["tool_call_id"],
                                }
                            )
                            current_function = None
                        except json.JSONDecodeError:
                            # If parsing fails, continue accumulating chunks
                            pass

            if chunk.choices[0].finish_reason == "tool_calls":
                if current_function:
                    yield self._create_function_call_response(current_function)
                    current_function = None

    def _create_function_call_response(
            self, function: Dict[str, Any]
    ) -> FunctionCallResponse:
        return FunctionCallResponse(
            function_name=function["name"],
            arguments=eval(function["arguments"]),
            tool_call_id=function["tool_call_id"],
        )

    async def _transform_messages(
            self, messages: List[Message]
    ) -> List[Dict[str, Any]]:
        return [message.model_dump(exclude_none=True) for message in messages]

    def _generate_function_schemas(
            self, function_registry: FunctionRegistry
    ) -> List[Dict[str, Any]]:
        schemas = []
        for registered_func in function_registry.values():
            schema = self._convert_schema(registered_func)
            schemas.append(schema)
        return schemas

    @staticmethod
    def _convert_schema(func: RegisteredFunction) -> Dict[str, Any]:
        parameters_schema = {"type": "object", "properties": {}, "required": []}

        for param in func.parameters:
            param_schema = {
                "type": map_python_type_to_json_schema(param.annotation),
                "description": param.description,
            }
            parameters_schema["properties"][param.name] = param_schema
            if param.default is None:
                parameters_schema["required"].append(param.name)

        function_schema = {
            "type": "function",
            "function": {
                "name": func.name,
                "description": func.description,
                "parameters": parameters_schema,
            },
        }

        return function_schema
