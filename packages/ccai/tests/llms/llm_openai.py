import json
import os
import time

from packages.ccai.ccai.core import SimpleChatMemory
from packages.ccai.ccai.core.llm.llm_openai import OpenAILLM
from packages.ccai.tests.tools.tools import function_manager

from dotenv import load_dotenv

load_dotenv(override=True)

chat_memory = SimpleChatMemory()

chat_memory.add_system_message(
    content="You are a helpful customer support assistant. Use the supplied tools to assist the user.",
)
chat_memory.add_user_message(
    content="What is the delivery date for order_12345?",
)

chat_memory.add_assistant_message(
    content="For that i need to search in my database",
)

chat_memory.add_tool_calls(
    tool_calls=[
        {
            "id": "call_62136354",
            "type": "function",
            "function": {
                "arguments": "{'order_id': 'order_12345'}",
                "name": "get_delivery_date",
            },
        }
    ],
)

chat_memory.add_tool_response(
    content=json.dumps(
        {
            "order_id": "order_12345",
            "delivery_date": "2022-12-31",
        }
    ),
    tool_call_id="call_62136354",
)


async def test_openai_llm():
    start = time.perf_counter()
    openai_llm = OpenAILLM(api_key=os.getenv("OPENAI_API_KEY"), temperature=0.0)
    response = openai_llm.invoke(
        chat_memory.get_messages(),
        function_manager.registered_functions,
    )

    async for event in response:
        print(event)

    print(f"Time taken: {time.perf_counter() - start:.2f}s")


if __name__ == "__main__":
    import asyncio

    asyncio.run(test_openai_llm())
