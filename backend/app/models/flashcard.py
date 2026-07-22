from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

DIFFICULTY_LEVELS = ("facil", "medio", "dificil")
REVIEW_RATINGS = ("errei", "dificil", "bom", "facil")
CARD_TYPES = ("basico", "cloze", "multipla_escolha", "verdadeiro_falso", "sequencia", "cenario")


class Flashcard(Base):
    __tablename__ = "flashcards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    note_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"), nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[str] = mapped_column(
        Enum(*DIFFICULTY_LEVELS, name="flashcard_difficulty"), nullable=False, default="medio"
    )
    card_type: Mapped[str] = mapped_column(
        Enum(*CARD_TYPES, name="card_type"), nullable=False, default="basico"
    )
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    note: Mapped["Note"] = relationship(back_populates="flashcards")
    reviews: Mapped[list["ReviewHistory"]] = relationship(back_populates="flashcard", lazy="selectin")


class ReviewHistory(Base):
    __tablename__ = "review_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    flashcard_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("flashcards.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    reviewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    rating: Mapped[str] = mapped_column(
        Enum(*REVIEW_RATINGS, name="review_rating"), nullable=False
    )
    stability: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    difficulty: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    next_review: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    flashcard: Mapped["Flashcard"] = relationship(back_populates="reviews")
    user: Mapped["User"] = relationship(back_populates="review_history")
