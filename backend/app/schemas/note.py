from pydantic import BaseModel


class TagOut(BaseModel):
    id: str
    name: str
    model_config = {"from_attributes": True}


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
