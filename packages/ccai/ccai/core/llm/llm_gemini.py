import json
from typing import List, Dict, Any, AsyncGenerator, Optional

from ccai.core.brain.simple_brain import logger
from ccai.core.function_manager.models import RegisteredFunction, FunctionRegistry
from ccai.core.llm.base import BaseLLM, LLMResponse, ChunkResponse, FunctionCallResponse
from ccai.core.messages.base import Message
from ccai.core.utils import map_python_type_to_json_schema
from ccai.core.logger import configure_logger
from ccai.core.tracing import observe_llm_generation
from langfuse import observe

logger = configure_logger(__name__)


class GeminiLLM(BaseLLM):
    """
    An implementation of BaseLLM that interacts with GeminiLLM's language db,
    supporting function calling and streaming responses.
    """

    def __init__(
        self, api_key: str, model: str = "gemini-2.0-flash", temperature: float = 0.0
    ):
        """
        Initialize the GeminiLLMLLM.

        Args:
            api_key (str): GeminiLLM API key.
            model (str): Model name (e.g., 'gpt-4o').
            temperature (float): Sampling temperature.
        """
        try:
            import openai
        except ImportError:
            raise ImportError(
                "Please install the GeminiLLM Python package by running 'pip install GeminiLLM'."
            )

        self.client = openai.AsyncClient(
            api_key=api_key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        )
        self.model = model
        self.temperature = temperature

    @observe(name="llm_generation_gemini")
    async def invoke(
        self, messages: List[Message], function_registry: FunctionRegistry
    ) -> AsyncGenerator[LLMResponse, None]:
        """
        Invoke the LLM with the given messages and function registry.

        Args:
            messages (List[Message]): Conversation history.
            function_registry (FunctionRegistry): Registered functions.

        Yields:
            LLMResponse: Responses from the LLM, including content chunks and function call responses.
        """
        transformed_messages = self._transform_messages(messages)
        function_schema = self._generate_function_schemas(function_registry)

        try:
            # Create the chat completion request
            chat_completion = await self.client.chat.completions.create(
                model=self.model,
                temperature=self.temperature,
                messages=transformed_messages,
                tools=function_schema or None,
                stream=True,
            )
        except Exception as e:
            logger.error(f"Failed to create chat completion: {e}")
            raise

        current_function: Optional[Dict[str, Any]] = None

        try:
            async for chunk in chat_completion:
                delta = chunk.choices[0].delta

                # Handle content chunks
                if delta.content:
                    yield ChunkResponse(content=delta.content)

                # Handle tool calls
                elif delta.tool_calls:
                    for tool_call in delta.tool_calls:
                        if tool_call.function.name:
                            if current_function:
                                yield self._create_function_call_response(
                                    current_function
                                )
                            current_function = {
                                "name": tool_call.function.name,
                                "arguments": "",
                                "tool_call_id": tool_call.id,
                            }

                        if tool_call.function.arguments:
                            current_function[
                                "arguments"
                            ] += tool_call.function.arguments
                            try:
                                # Attempt to parse the accumulated JSON
                                parsed_args = json.loads(current_function["arguments"])
                                yield self._create_function_call_response(
                                    {
                                        "name": current_function["name"],
                                        "arguments": parsed_args,
                                        "tool_call_id": current_function[
                                            "tool_call_id"
                                        ],
                                    }
                                )
                                current_function = None
                            except json.JSONDecodeError:
                                # If parsing fails, continue accumulating chunks
                                pass

                # Handle finish reason
                if chunk.choices[0].finish_reason == "tool_calls":
                    if current_function:
                        yield self._create_function_call_response(current_function)
                        current_function = None

        except Exception as e:
            logger.error(f"Error during chat completion streaming: {e}")
            raise

    def _create_function_call_response(
        self, function: Dict[str, Any]
    ) -> FunctionCallResponse:
        """
        Create a FunctionCallResponse object from the function data.

        Args:
            function (Dict[str, Any]): Function data.

        Returns:
            FunctionCallResponse: The function call response.
        """
        import uuid

        return FunctionCallResponse(
            function_name=function["name"],
            arguments=function["arguments"],
            tool_call_id=(
                function["tool_call_id"]
                if function["tool_call_id"]
                else str(uuid.uuid4())
            ),
        )

    def _transform_messages(self, messages: List[Message]) -> List[Dict[str, Any]]:
        """
        Transform messages into the format expected by the GeminiLLM API.

        Args:
            messages (List[Message]): Conversation history.

        Returns:
            List[Dict[str, Any]]: Transformed messages.
        """
        return [message.model_dump(exclude_none=True) for message in messages]

    def _generate_function_schemas(
        self, function_registry: FunctionRegistry
    ) -> List[Dict[str, Any]]:
        """
        Generate function schemas for the GeminiLLM API from the registered functions.

        Args:
            function_registry (FunctionRegistry): Registered functions.

        Returns:
            List[Dict[str, Any]]: Function schemas.
        """
        schemas = []
        for registered_func in function_registry.values():
            schema = self._convert_schema(registered_func)
            schemas.append(schema)
        return schemas

    @staticmethod
    def _convert_schema(func: RegisteredFunction) -> Dict[str, Any]:
        """
        Convert a RegisteredFunction into a function schema for the GeminiLLM API.

        Args:
            func (RegisteredFunction): The registered function.

        Returns:
            Dict[str, Any]: The function schema.
        """
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
