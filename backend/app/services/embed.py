import json
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

_model = None


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(settings.EMBEDDING_MODEL)
    return _model


async def embed_query(text: str) -> list[float]:
    model = _get_model()
    return model.encode(text).tolist()


async def embed_texts(texts: list[str]) -> list[list[float]]:
    model = _get_model()
    return model.encode(texts).tolist()


def _to_embedding_str(embedding: list[float]) -> str:
    return json.dumps(embedding)


async def search_similar(db, query_embedding: list[float], limit: int = 5) -> list[tuple[str, float]]:
    from sqlalchemy import text
    embedding_str = _to_embedding_str(query_embedding)
    result = await db.execute(
        text(
            """SELECT nc.content, 1 - (nc.embedding <=> :embedding) AS similarity
               FROM note_chunks nc
               WHERE nc.embedding IS NOT NULL
               ORDER BY nc.embedding <=> :embedding
               LIMIT :limit"""
        ),
        {"embedding": embedding_str, "limit": limit},
    )
    return [(row[0], row[1]) for row in result.fetchall()]


async def search_similar_user(db, query_embedding: list[float], user_id, limit: int = 5) -> list[tuple[str, float]]:
    from sqlalchemy import text
    import uuid as _uuid
    embedding_str = _to_embedding_str(query_embedding)
    result = await db.execute(
        text(
            """SELECT nc.content, 1 - (nc.embedding <=> :embedding) AS similarity
               FROM note_chunks nc
               JOIN notes n ON n.id = nc.note_id
               WHERE nc.embedding IS NOT NULL
                 AND n.user_id = CAST(:user_id AS uuid)
               ORDER BY nc.embedding <=> :embedding
               LIMIT :limit"""
        ),
        {"embedding": embedding_str, "user_id": str(user_id), "limit": limit},
    )
    return [(row[0], row[1]) for row in result.fetchall()]


async def schedule_embeddings(note_id: str):
    logger.info("[EMBED] starting sync generation for note %s", note_id[:8])
    try:
        await _generate_embeddings_sync(note_id)
    except Exception as e:
        logger.error("[EMBED] generation FAILED for note %s: %s", note_id[:8], str(e)[:300])


async def _generate_embeddings_sync(note_id: str):
    import uuid
    import re
    from sqlalchemy import select
    from app.core.database import async_session
    from app.models.note import Note, NoteChunk

    nid = uuid.UUID(note_id)

    async with async_session() as db:
        result = await db.execute(select(Note).where(Note.id == nid))
        note = result.scalar_one_or_none()
        if not note or not note.content_md.strip():
            logger.warning("[EMBED] note %s not found or empty", note_id[:8])
            return

        content = note.content_md
        logger.info("[EMBED] note %s — %d chars, generating chunks...", note_id[:8], len(content))

        existing = await db.execute(select(NoteChunk).where(NoteChunk.note_id == nid))
        for chunk in existing.scalars().all():
            await db.delete(chunk)

        chunks = _chunk_markdown(content, settings.CHUNK_SIZE, settings.CHUNK_OVERLAP)

        logger.info("[EMBED] note %s — %d chunks, generating vectors...", note_id[:8], len(chunks))

        if chunks:
            try:
                embeddings = await embed_texts(list(chunks))
                db_chunks = [NoteChunk(note_id=nid, content=c, embedding=e) for c, e in zip(chunks, embeddings)]
                db.add_all(db_chunks)
                await db.commit()
                logger.info("[EMBED] note %s — %d embeddings stored OK", note_id[:8], len(chunks))
            except Exception as e:
                logger.error("[EMBED] model error for note %s: %s", note_id[:8], str(e)[:200])
                raise
        else:
            logger.warning("[EMBED] note %s — no chunks generated", note_id[:8])


def _chunk_markdown(content: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    import re
    lines = content.split("\n")
    sections = []
    current = []
    for line in lines:
        if re.match(r"^#{1,2}\s", line):
            if current:
                sections.append("\n".join(current).strip())
            current = [line]
        else:
            current.append(line)
    if current:
        sections.append("\n".join(current).strip())

    result = []
    for section in sections:
        if not section:
            continue
        if len(section) <= chunk_size:
            result.append(section)
        else:
            words = section.split()
            for i in range(0, len(words), chunk_size - chunk_overlap if chunk_size > chunk_overlap else chunk_size):
                chunk = " ".join(words[i : i + chunk_size])
                if chunk.strip():
                    result.append(chunk)
    return result
