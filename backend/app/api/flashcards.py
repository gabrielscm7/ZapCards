import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.config import settings
from app.core.database import get_db
from app.models.flashcard import Flashcard, ReviewHistory
from app.models.note import Note, NoteChunk
from app.models.user import User
from app.schemas.flashcard import FlashcardGenerate, FlashcardOut, ReviewOut, ReviewSubmit
from app.services.llm import generate_flashcards
from app.services.embed import embed_query, search_similar
from app.services.auth import get_required_user

router = APIRouter()


@router.post("/generate", response_model=list[FlashcardOut], status_code=201)
async def generate(
    payload: FlashcardGenerate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_required_user),
):
    result = await db.execute(
        select(Note).where(Note.id.in_(payload.note_ids), Note.user_id == user.id)
    )
    notes = result.scalars().all()
    if not notes:
        raise HTTPException(status_code=404, detail="Notas nao encontradas")

    content = "\n\n".join(f"# {n.title}\n{n.content_md}" for n in notes)
    items = await generate_flashcards(content, payload.difficulty, payload.quantity)

    note_count = len(notes)
    cards = []
    import json
    for i, item in enumerate(items):
        note = notes[i % note_count]
        card_type = item.get("card_type", "basico")

        if card_type == "cloze":
            question = item.get("cloze_text", "")
            answer = item.get("answer", "")
        elif card_type == "multipla_escolha":
            question = item.get("question", "")
            answer = item.get("answer", "")
        elif card_type == "verdadeiro_falso":
            question = item.get("statement", "")
            answer = str(item.get("is_true", False))
        elif card_type == "cenario":
            question = f"{item.get('scenario', '')}\n\n{item.get('question', '')}"
            answer = item.get("answer", "")
        elif card_type == "sequencia":
            steps = item.get("steps", [])
            question = item.get("question", "Ordene os passos:")
            answer = " > ".join(steps)
        else:
            question = item.get("question", "")
            answer = item.get("answer", "")

        metadata = {k: v for k, v in item.items() if k not in ("card_type", "question", "answer", "cloze_text", "statement", "scenario", "steps", "difficulty")}
        metadata["card_type"] = card_type

        card = Flashcard(
            note_id=note.id,
            question=question,
            answer=answer,
            difficulty=payload.difficulty,
            card_type=card_type,
            metadata_json=json.dumps(metadata) if metadata else None,
        )
        db.add(card)
        cards.append(card)

    await db.flush()
    for c in cards:
        await db.refresh(c)
    return cards


@router.get("", response_model=list[FlashcardOut])
async def list_flashcards(
    note_id: str | None = Query(None),
    difficulty: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_required_user),
):
    stmt = (
        select(Flashcard)
        .join(Note, Flashcard.note_id == Note.id)
        .where(Note.user_id == user.id)
    )
    if note_id:
        stmt = stmt.where(Flashcard.note_id == note_id)
    if difficulty:
        stmt = stmt.where(Flashcard.difficulty == difficulty)
    result = await db.execute(stmt.order_by(Flashcard.created_at.desc()))
    return result.scalars().all()


@router.get("/due", response_model=list[FlashcardOut])
async def get_due_cards(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_required_user),
):
    result = await db.execute(
        select(ReviewHistory)
        .where(ReviewHistory.user_id == user_id, ReviewHistory.next_review <= datetime.now(timezone.utc))
        .order_by(ReviewHistory.next_review)
    )
    reviews = result.scalars().all()
    card_ids = [r.flashcard_id for r in reviews]
    if not card_ids:
        return []
    cards_result = await db.execute(select(Flashcard).where(Flashcard.id.in_(card_ids)))
    return cards_result.scalars().all()


@router.post("/review", response_model=ReviewOut)
async def submit_review(
    payload: ReviewSubmit,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_required_user),
):
    from fsrs import Card, FSRS, Rating

    card_result = await db.execute(select(Flashcard).where(Flashcard.id == payload.flashcard_id))
    card = card_result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard nao encontrado")

    rating_map = {"errei": Rating.Again, "dificil": Rating.Hard, "bom": Rating.Good, "facil": Rating.Easy}
    fsrs_rating = rating_map.get(payload.rating, Rating.Good)

    last_review = await db.execute(
        select(ReviewHistory)
        .where(ReviewHistory.flashcard_id == payload.flashcard_id, ReviewHistory.user_id == payload.user_id)
        .order_by(ReviewHistory.reviewed_at.desc())
    )
    last = last_review.scalar_one_or_none()

    f = FSRS()
    fsrs_card = Card()
    if last:
        fsrs_card = Card(
            stability=last.stability,
            difficulty=last.difficulty,
            state=2,
        )

    scheduling = f.repeat(fsrs_card, datetime.now(timezone.utc))[fsrs_rating]

    review = ReviewHistory(
        flashcard_id=payload.flashcard_id,
        user_id=payload.user_id,
        rating=payload.rating,
        stability=scheduling.stability,
        difficulty=scheduling.difficulty,
        next_review=scheduling.due,
    )
    db.add(review)
    await db.flush()
    await db.refresh(review)
    return review


@router.delete("/{flashcard_id}", status_code=204)
async def delete_flashcard(
    flashcard_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_required_user),
):
    result = await db.execute(
        select(Flashcard)
        .join(Note, Flashcard.note_id == Note.id)
        .where(Flashcard.id == flashcard_id, Note.user_id == user.id)
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard nao encontrado")
    await db.delete(card)
    await db.flush()
