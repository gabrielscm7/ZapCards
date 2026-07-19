from pydantic import BaseModel


class ChatMessage(BaseModel):
    content: str


class ChatResponse(BaseModel):
    content: str
    sources: list[str] = []


class ImportResult(BaseModel):
    note_id: str
    title: str
    source_type: str
