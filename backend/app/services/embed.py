import json
import logging

from sentence_transformers import SentenceTransformer

from app.core.config import settings

logger = logging.getLogger(__name__)

_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
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


async def schedule_embeddings(note_id: str):
    try:
        from app.core.redis import get_redis
        pool = await get_redis()
        await pool.enqueue_job("generate_embeddings", note_id)
        logger.info("Enqueued embedding job for note %s via Redis", note_id)
    except Exception:
        logger.warning("Redis unavailable, generating embeddings synchronously for note %s", note_id)
        await _generate_embeddings_sync(note_id)


async def _generate_embeddings_sync(note_id: str):
    from sqlalchemy import select
    from app.core.database import async_session
    from app.models.note import Note, NoteChunk

    async with async_session() as db:
        result = await db.execute(select(Note).where(Note.id == note_id))
        note = result.scalar_one_or_none()
        if not note or not note.content_md.strip():
            return

        existing = await db.execute(select(NoteChunk).where(NoteChunk.note_id == note_id))
        for chunk in existing.scalars().all():
            await db.delete(chunk)

        words = note.content_md.split()
        chunks = []
        for i in range(0, len(words), settings.CHUNK_SIZE):
            chunk_text = " ".join(words[i : i + settings.CHUNK_SIZE])
            if chunk_text.strip():
                chunks.append(NoteChunk(note_id=note_id, content=chunk_text))

        if chunks:
            embeddings = await embed_texts([c.content for c in chunks])
            for c, emb in zip(chunks, embeddings):
                c.embedding = emb
            db.add_all(chunks)
            await db.commit()
            logger.info("Generated %d embeddings synchronously for note %s", len(chunks), note_id)
