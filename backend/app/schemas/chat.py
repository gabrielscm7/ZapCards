import uuid

from pydantic import BaseModel, field_serializer


class ChatMessage(BaseModel):
    content: str


class ChatResponse(BaseModel):
    content: str
    sources: list[str] = []


class ImportResult(BaseModel):
    note_id: str
    title: str
    source_type: str

    @field_serializer("note_id")
    def _serialize_id(self, value: uuid.UUID | str) -> str:
        return str(value)
