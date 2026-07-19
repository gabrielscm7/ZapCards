import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, DateTime, Enum, ForeignKey, Table, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

NOTE_SOURCE_TYPES = ("text", "ocr", "pdf", "docx", "csv", "audio", "video")

note_tags = Table(
    "note_tags",
    Base.metadata,
    Column("note_id", ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(Text, nullable=False, default="")
    content_md: Mapped[str] = mapped_column(Text, nullable=False, default="")
    area: Mapped[str] = mapped_column(Text, nullable=False, default="")
    source_type: Mapped[str] = mapped_column(
        Enum(*NOTE_SOURCE_TYPES, name="note_source_type"), nullable=False, default="text"
    )
    source_file: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tags: Mapped[list["Tag"]] = relationship(secondary=note_tags, back_populates="notes", lazy="selectin")
    chunks: Mapped[list["NoteChunk"]] = relationship(back_populates="note", cascade="all, delete-orphan")
    flashcards: Mapped[list["Flashcard"]] = relationship(back_populates="note", cascade="all, delete-orphan")

    outgoing_links: Mapped[list["NoteLink"]] = relationship(
        foreign_keys="NoteLink.from_note_id", back_populates="from_note", cascade="all, delete-orphan"
    )
    incoming_links: Mapped[list["NoteLink"]] = relationship(
        foreign_keys="NoteLink.to_note_id", back_populates="to_note", cascade="all, delete-orphan"
    )


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)

    notes: Mapped[list["Note"]] = relationship(secondary=note_tags, back_populates="tags", lazy="selectin")


class NoteLink(Base):
    __tablename__ = "note_links"

    from_note_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True
    )
    to_note_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True
    )

    from_note: Mapped["Note"] = relationship(foreign_keys=[from_note_id], back_populates="outgoing_links")
    to_note: Mapped["Note"] = relationship(foreign_keys=[to_note_id], back_populates="incoming_links")


class NoteChunk(Base):
    __tablename__ = "note_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    note_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1024), nullable=True)

    note: Mapped["Note"] = relationship(back_populates="chunks")
