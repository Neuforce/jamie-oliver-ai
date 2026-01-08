from abc import ABC

from ccai.core.messages.base import UserMessage


class BaseBrain(ABC):
    async def process(self, message: UserMessage):
        pass
