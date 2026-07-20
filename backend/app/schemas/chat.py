from typing import Any

from pydantic import BaseModel, field_validator


class ChatMessage(BaseModel):
    content: str


class ChatResponse(BaseModel):
    content: str
    sources: list[str] = []


class ImportResult(BaseModel):
    note_id: str
    title: str
    source_type: str

    @field_validator("note_id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> str:
        return str(v)
