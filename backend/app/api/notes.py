import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db, get_db_read
from app.core.redis import get_redis
from app.models.note import Note, Tag, NoteLink
from app.models.user import User
from app.schemas.note import NoteCreate, NoteOut, NoteUpdate, TagOut
from app.services.auth import get_required_user

logger = logging.getLogger(__name__)
router = APIRouter()


async def _trigger_embeddings_background(note_id: str):
    try:
        pool = await get_redis()
        await pool.enqueue_job("generate_embeddings", note_id)
        logger.info("Enqueued embedding generation for note %s", note_id[:8])
    except Exception as e:
        logger.warning("Could not enqueue embedding job for note %s: %s", note_id[:8], e)


# ---------------------------------------------------------------------------
# Static routes — MUST come before /{note_id} dynamic route
# ---------------------------------------------------------------------------

@router.get("/tags", response_model=list[TagOut])
async def list_tags(
    db: AsyncSession = Depends(get_db_read),
    user: User = Depends(get_required_user),
):
    result = await db.execute(select(Tag).order_by(Tag.name))
    return result.scalars().all()


@router.get("/graph/data", response_model=dict)
async def get_graph(
    tag: str | None = Query(None),
    area: str | None = Query(None),
    db: AsyncSession = Depends(get_db_read),
    user: User = Depends(get_required_user),
):
    note_stmt = select(Note).options(selectinload(Note.tags)).where(Note.user_id == user.id)
    if area:
        note_stmt = note_stmt.where(Note.area == area)
    if tag:
        note_stmt = note_stmt.join(Note.tags).where(Tag.name == tag)
    notes_result = await db.execute(note_stmt)
    notes = notes_result.scalars().all()

    nodes = [
        {"id": str(n.id), "label": n.title, "area": n.area, "tags": [t.name for t in n.tags]}
        for n in notes
    ]
    note_ids = [str(n.id) for n in notes]

    if note_ids:
        links_result = await db.execute(
            select(NoteLink).where(
                NoteLink.from_note_id.in_(note_ids) & NoteLink.to_note_id.in_(note_ids)
            )
        )
        links = links_result.scalars().all()
        edges = [{"source": str(l.from_note_id), "target": str(l.to_note_id)} for l in links]
    else:
        edges = []

    return {"nodes": nodes, "edges": edges}


@router.get("/generate-embeddings-all")
async def generate_all_embeddings(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_required_user),
):
    from sqlalchemy import text
    result = await db.execute(
        text("SELECT id FROM notes WHERE user_id = CAST(:uid AS uuid)"),
        {"uid": str(user.id)},
    )
    note_ids = [row[0] for row in result.fetchall()]
    count = 0
    for nid in note_ids:
        try:
            _trigger_embeddings_background(str(nid))
            count += 1
        except Exception:
            pass
    return {"status": "ok", "enqueued": count, "total": len(note_ids)}


@router.get("/stats/embeddings")
async def embeddings_stats(
    db: AsyncSession = Depends(get_db_read),
    user: User = Depends(get_required_user),
):
    from sqlalchemy import text
    total_emb = await db.execute(text("SELECT COUNT(*) FROM note_chunks WHERE embedding IS NOT NULL"))
    total_notes = await db.execute(
        text("SELECT COUNT(*) FROM notes WHERE user_id = CAST(:uid AS uuid)"),
        {"uid": str(user.id)},
    )
    total_chunks = await db.execute(text("SELECT COUNT(*) FROM note_chunks"))
    return {
        "notes_total": total_notes.scalar(),
        "chunks_total": total_chunks.scalar(),
        "chunks_with_embeddings": total_emb.scalar(),
    }


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.post("", response_model=NoteOut, status_code=201)
async def create_note(
    payload: NoteCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_required_user),
):
    note = Note(user_id=user.id, **payload.model_dump(exclude={"tags"}))
    if payload.tags:
        result = await db.execute(select(Tag).where(Tag.name.in_(payload.tags)))
        existing = {t.name: t for t in result.scalars().all()}
        for tag_name in payload.tags:
            if tag_name not in existing:
                tag = Tag(name=tag_name)
                db.add(tag)
                existing[tag_name] = tag
        note.tags = list(existing.values())
    db.add(note)
    await db.flush()
    await db.refresh(note)
    _trigger_embeddings_background(str(note.id))
    return note


@router.get("", response_model=list[NoteOut])
async def list_notes(
    area: str | None = Query(None),
    tag: str | None = Query(None),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db_read),
    user: User = Depends(get_required_user),
):
    stmt = (
        select(Note)
        .options(selectinload(Note.tags))
        .where(Note.user_id == user.id)
    )
    if area:
        stmt = stmt.where(Note.area == area)
    if tag:
        stmt = stmt.join(Note.tags).where(Tag.name == tag)
    if search:
        stmt = stmt.where(Note.title.ilike(f"%{search}%") | Note.content_md.ilike(f"%{search}%"))
    stmt = stmt.order_by(Note.updated_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Dynamic routes — MUST come after static routes
# ---------------------------------------------------------------------------

@router.get("/{note_id}", response_model=NoteOut)
async def get_note(
    note_id: str,
    db: AsyncSession = Depends(get_db_read),
    user: User = Depends(get_required_user),
):
    result = await db.execute(
        select(Note)
        .options(selectinload(Note.tags))
        .where(Note.id == note_id, Note.user_id == user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Nota nao encontrada")
    return note


@router.patch("/{note_id}", response_model=NoteOut)
async def update_note(
    note_id: str,
    payload: NoteUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_required_user),
):
    result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Nota nao encontrada")
    update_data = payload.model_dump(exclude_unset=True, exclude={"tags"})
    for key, value in update_data.items():
        setattr(note, key, value)
    if payload.tags is not None:
        tags_result = await db.execute(select(Tag).where(Tag.name.in_(payload.tags)))
        existing = {t.name: t for t in tags_result.scalars().all()}
        for tag_name in payload.tags:
            if tag_name not in existing:
                tag = Tag(name=tag_name)
                db.add(tag)
                existing[tag_name] = tag
        note.tags = list(existing.values())
    await db.flush()
    await db.refresh(note)
    _trigger_embeddings_background(str(note.id))
    return note


@router.delete("/{note_id}", status_code=204)
async def delete_note(
    note_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_required_user),
):
    result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Nota nao encontrada")
    await db.delete(note)
    await db.flush()


@router.post("/{note_id}/embeddings", status_code=202)
async def trigger_embeddings(
    note_id: str,
    user: User = Depends(get_required_user),
):
    await _trigger_embeddings_background(note_id)
    return {"status": "ok", "note_id": note_id}


@router.post("/{note_id}/link/{target_id}", status_code=201)
async def link_notes(
    note_id: str,
    target_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_required_user),
):
    note_result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user.id)
    )
    if not note_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Nota de origem nao encontrada")
    target_result = await db.execute(
        select(Note).where(Note.id == target_id, Note.user_id == user.id)
    )
    if not target_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Nota de destino nao encontrada")

    existing = await db.execute(
        select(NoteLink).where(
            NoteLink.from_note_id == note_id, NoteLink.to_note_id == target_id
        )
    )
    if existing.scalar_one_or_none():
        return {"status": "already_linked"}
    link = NoteLink(from_note_id=note_id, to_note_id=target_id)
    db.add(link)
    await db.flush()
    return {"status": "linked"}


@router.delete("/{note_id}/link/{target_id}", status_code=204)
async def unlink_notes(
    note_id: str,
    target_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_required_user),
):
    result = await db.execute(
        select(NoteLink).where(
            NoteLink.from_note_id == note_id, NoteLink.to_note_id == target_id
        )
    )
    link = result.scalar_one_or_none()
    if link:
        await db.delete(link)
        await db.flush()
