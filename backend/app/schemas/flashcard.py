from pydantic import BaseModel


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
