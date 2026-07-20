import uuid
from datetime import datetime

from pydantic import BaseModel, field_serializer


class FlashcardGenerate(BaseModel):
    note_ids: list[str]
    difficulty: str = "medio"
    quantity: int = 5


class FlashcardOut(BaseModel):
    id: str
    note_id: str
    question: str
    answer: str
    difficulty: str
    created_at: str
    model_config = {"from_attributes": True}

    @field_serializer("id", "note_id")
    def _serialize_id(self, value: uuid.UUID | str) -> str:
        return str(value)

    @field_serializer("created_at")
    def _serialize_datetime(self, value: datetime | str) -> str:
        if isinstance(value, datetime):
            return value.isoformat()
        return value


class ReviewSubmit(BaseModel):
    flashcard_id: str
    user_id: str
    rating: str


class ReviewOut(BaseModel):
    id: str
    flashcard_id: str
    user_id: str
    reviewed_at: str
    rating: str
    stability: float
    difficulty: float
    next_review: str
    model_config = {"from_attributes": True}

    @field_serializer("id", "flashcard_id", "user_id")
    def _serialize_id(self, value: uuid.UUID | str) -> str:
        return str(value)

    @field_serializer("reviewed_at", "next_review")
    def _serialize_datetime(self, value: datetime | str) -> str:
        if isinstance(value, datetime):
            return value.isoformat()
        return value
