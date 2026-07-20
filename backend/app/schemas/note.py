import uuid
from datetime import datetime

from pydantic import BaseModel, field_serializer


class TagOut(BaseModel):
    id: str
    name: str
    model_config = {"from_attributes": True}

    @field_serializer("id")
    def _serialize_id(self, value: uuid.UUID | str) -> str:
        return str(value)


class NoteCreate(BaseModel):
    title: str = ""
    content_md: str = ""
    area: str = ""
    source_type: str = "text"
    source_file: str | None = None
    tags: list[str] = []


class NoteUpdate(BaseModel):
    title: str | None = None
    content_md: str | None = None
    area: str | None = None
    tags: list[str] | None = None


class NoteOut(BaseModel):
    id: str
    title: str
    content_md: str
    area: str
    source_type: str
    source_file: str | None
    created_at: str
    updated_at: str
    tags: list[TagOut] = []
    model_config = {"from_attributes": True}

    @field_serializer("id")
    def _serialize_id(self, value: uuid.UUID | str) -> str:
        return str(value)

    @field_serializer("created_at", "updated_at")
    def _serialize_datetime(self, value: datetime | str) -> str:
        if isinstance(value, datetime):
            return value.isoformat()
        return value
