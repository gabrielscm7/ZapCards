import io
import json
import logging
import os
import sys

from arq import create_pool
from arq.connections import RedisSettings

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

from app.core.config import settings
from app.core.s3 import get_file, save_file

logger = logging.getLogger(__name__)

ARQ_SETTINGS = RedisSettings.from_dsn(settings.REDIS_URL)


async def _update_note_in_db(ctx, note_id: str, content: str):
    from sqlalchemy import update
    from app.core.database import async_session
    from app.models.note import Note

    async with async_session() as db:
        await db.execute(
            update(Note).where(Note.id == note_id).values(content_md=content)
        )
        await db.commit()

    await ctx["redis"].enqueue_job("generate_embeddings", note_id)
    logger.info("Updated note %s, enqueued embedding job", note_id)


async def process_ocr(ctx, note_id: str, file_key: str):
    from PIL import Image
    import pytesseract

    data = get_file(file_key)
    if not data:
        logger.error("File not found: %s", file_key)
        return

    img = Image.open(io.BytesIO(data))
    text = pytesseract.image_to_string(img, lang="por+eng")
    logger.info("OCR processed %s (%d chars)", file_key, len(text))

    async with create_pool(ARQ_SETTINGS) as pool:
        await pool.enqueue_job("update_note_content", note_id, text)


async def process_pdf(ctx, note_id: str, file_key: str):
    from markitdown import MarkItDown

    data = get_file(file_key)
    if not data:
        logger.error("File not found: %s", file_key)
        return

    ext = os.path.splitext(file_key)[1].lower()
    md = MarkItDown()
    result = md.convert(io.BytesIO(data), file_extension=ext or ".pdf")
    text = result.text_content if hasattr(result, "text_content") else str(result)
    logger.info("PDF processed %s (%d chars)", file_key, len(text))

    async with create_pool(ARQ_SETTINGS) as pool:
        await pool.enqueue_job("update_note_content", note_id, text)


async def process_audio(ctx, note_id: str, file_key: str):
    from groq import Groq

    data = get_file(file_key)
    if not data:
        logger.error("File not found: %s", file_key)
        return

    client = Groq(api_key=settings.GROQ_API_KEY)
    transcript = client.audio.transcriptions.create(
        model="whisper-large-v3-turbo",
        file=(os.path.basename(file_key), data),
        response_format="text",
    )
    text = transcript if isinstance(transcript, str) else str(transcript)
    logger.info("Audio transcribed %s (%d chars)", file_key, len(text))

    async with create_pool(ARQ_SETTINGS) as pool:
        await pool.enqueue_job("update_note_content", note_id, text)


async def generate_embeddings(ctx, note_id: str):
    from sqlalchemy import select
    from app.core.database import async_session
    from app.models.note import Note, NoteChunk
    from app.services.embed import embed_texts
    from app.core.config import settings as s

    async with async_session() as db:
        result = await db.execute(select(Note).where(Note.id == note_id))
        note = result.scalar_one_or_none()
        if not note:
            return

        existing = await db.execute(
            select(NoteChunk).where(NoteChunk.note_id == note_id)
        )
        for chunk in existing.scalars().all():
            await db.delete(chunk)

        content = note.content_md
        words = content.split()
        chunks = []
        for i in range(0, len(words), s.CHUNK_SIZE):
            chunk_text = " ".join(words[i : i + s.CHUNK_SIZE])
            if chunk_text.strip():
                chunks.append(NoteChunk(note_id=note_id, content=chunk_text))

        if chunks:
            embeddings = await embed_texts([c.content for c in chunks])
            for c, emb in zip(chunks, embeddings):
                c.embedding = emb
            db.add_all(chunks)
            await db.commit()
            logger.info("Generated %d embeddings for note %s", len(chunks), note_id)


async def update_note_content(ctx, note_id: str, content: str):
    await _update_note_in_db(ctx, note_id, content)


class WorkerSettings:
    functions = [
        process_ocr,
        process_pdf,
        process_audio,
        generate_embeddings,
        update_note_content,
    ]
    redis_settings = ARQ_SETTINGS
    max_jobs = 10
    log_results = True
