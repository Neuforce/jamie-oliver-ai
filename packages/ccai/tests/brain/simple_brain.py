import os
import time

from packages.ccai.ccai.core.brain.simple_brain import SimpleBrain
from packages.ccai.ccai.core.llm.llm_groq import GroqLLM
from packages.ccai.ccai.core.messages.base import UserMessage
from packages.ccai.tests.tools.tools import function_manager
from packages.ccai.ccai.core import SimpleChatMemory

from dotenv import load_dotenv

load_dotenv(override=True)

chat_memory = SimpleChatMemory()

chat_memory.add_system_message(
    content="You are a helpful customer support assistant. Use the supplied tools to assist the user.",
)


async def test_openai_llm():
    start = time.perf_counter()

    brain = SimpleBrain(
        # llm=OpenAILLM(
        #     api_key=os.getenv("OPENAI_API_KEY"),
        #     model="gpt-4o-mini",
        #     temperature=0.0,
        # ),
        llm=GroqLLM(
            api_key=os.getenv("GROQ_API_KEY"),
            model="llama-3.1-70b-versatile",
            temperature=0.0,
        ),
        chat_memory=chat_memory,
        function_manager=function_manager,
    )

    generator = brain.process(
        UserMessage(
            content="What are you up to?",
        )
    )

    async for event in generator:
        print(event)

    print(f"Time taken: {time.perf_counter() - start:.2f}s")


if __name__ == "__main__":
    import asyncio

    asyncio.run(test_openai_llm())
