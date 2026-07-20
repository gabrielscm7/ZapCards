from typing import Any

from pydantic import BaseModel, field_validator


class TagOut(BaseModel):
    id: str
    name: str
    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> str:
        return str(v)


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

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> str:
        return str(v)

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _coerce_datetime(cls, v: Any) -> str:
        if hasattr(v, "isoformat"):
            return v.isoformat()
        return str(v)
