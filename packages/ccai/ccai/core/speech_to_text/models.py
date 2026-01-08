from typing import Optional

from pydantic import BaseModel


class Transcription(BaseModel):
    content: str
    confidence: Optional[float] = 0.0
    is_final: bool
