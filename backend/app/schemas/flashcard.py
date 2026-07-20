from typing import Any

from pydantic import BaseModel, field_validator


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

    @field_validator("id", "note_id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> str:
        return str(v)

    @field_validator("created_at", mode="before")
    @classmethod
    def _coerce_datetime(cls, v: Any) -> str:
        if hasattr(v, "isoformat"):
            return v.isoformat()
        return str(v)


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

    @field_validator("id", "flashcard_id", "user_id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> str:
        return str(v)

    @field_validator("reviewed_at", "next_review", mode="before")
    @classmethod
    def _coerce_datetime(cls, v: Any) -> str:
        if hasattr(v, "isoformat"):
            return v.isoformat()
        return str(v)
