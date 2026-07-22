import json
import logging
import os

from arq import create_pool
from arq.connections import RedisSettings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("zapcards-workers")

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

ARQ_SETTINGS = RedisSettings.from_dsn(REDIS_URL)


async def update_note_content(ctx, note_id: str, content: str):
    from sqlalchemy import text
    from app.core.database import async_session, engine as be_engine

    async with async_session() as db:
        await db.execute(
            text("UPDATE notes SET content_md = :content WHERE id = CAST(:id AS uuid)"),
            {"content": content, "id": note_id},
        )
        await db.commit()

    await ctx["redis"].enqueue_job("generate_embeddings", note_id)
    logger.info("Updated note %s, enqueued embedding job", note_id)


async def process_ocr(ctx, note_id: str, file_key: str):
    import io
    from PIL import Image
    import pytesseract

    from app.core.s3 import get_file as s3_get_file

    data = s3_get_file(file_key)
    if not data:
        logger.error("File not found: %s", file_key)
        return

    img = Image.open(io.BytesIO(data))
    text = pytesseract.image_to_string(img, lang="por+eng")
    logger.info("OCR processed %s (%d chars)", file_key, len(text))

    async with create_pool(ARQ_SETTINGS) as pool:
        await pool.enqueue_job("update_note_content", note_id, text)


async def process_pdf(ctx, note_id: str, file_key: str):
    import io
    from markitdown import MarkItDown

    from app.core.s3 import get_file as s3_get_file

    data = s3_get_file(file_key)
    if not data:
        logger.error("File not found: %s", file_key)
        return

    ext = os.path.splitext(file_key)[1].lower() or ".pdf"
    md = MarkItDown()
    result = md.convert(io.BytesIO(data), file_extension=ext)
    text = result.text_content if hasattr(result, "text_content") else str(result)
    logger.info("PDF processed %s (%d chars)", file_key, len(text))

    async with create_pool(ARQ_SETTINGS) as pool:
        await pool.enqueue_job("update_note_content", note_id, text)


async def process_audio(ctx, note_id: str, file_key: str):
    from groq import AsyncGroq

    from app.core.config import settings
    from app.core.s3 import get_file as s3_get_file

    data = s3_get_file(file_key)
    if not data:
        logger.error("File not found: %s", file_key)
        return

    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    transcript = await client.audio.transcriptions.create(
        model="whisper-large-v3-turbo",
        file=(os.path.basename(file_key), data),
        response_format="text",
    )
    text = transcript if isinstance(transcript, str) else str(transcript)
    logger.info("Audio transcribed %s (%d chars)", file_key, len(text))

    async with create_pool(ARQ_SETTINGS) as pool:
        await pool.enqueue_job("update_note_content", note_id, text)


async def generate_embeddings(ctx, note_id: str):
    from sqlalchemy import text
    from sentence_transformers import SentenceTransformer

    from app.core.config import settings
    from app.core.database import async_session

    model = SentenceTransformer(settings.EMBEDDING_MODEL)

    async with async_session() as db:
        result = await db.execute(
            text("SELECT content_md FROM notes WHERE id = CAST(:id AS uuid)"),
            {"id": note_id},
        )
        row = result.fetchone()
        if not row or not row[0]:
            return

        content = row[0]
        await db.execute(
            text("DELETE FROM note_chunks WHERE note_id = CAST(:id AS uuid)"),
            {"id": note_id},
        )

        words = content.split()
        embed_data = []
        for i in range(0, len(words), settings.CHUNK_SIZE):
            chunk_text = " ".join(words[i : i + settings.CHUNK_SIZE])
            if chunk_text.strip():
                embed_data.append(chunk_text)

        if embed_data:
            embeddings = model.encode(embed_data).tolist()
            for chunk_text, emb in zip(embed_data, embeddings):
                await db.execute(
                    text(
                        "INSERT INTO note_chunks (note_id, content, embedding) "
                        "VALUES (CAST(:nid AS uuid), :content, :emb::vector)"
                    ),
                    {"nid": note_id, "content": chunk_text, "emb": json.dumps(emb)},
                )
            await db.commit()
            logger.info("Generated %d embeddings for note %s", len(embed_data), note_id)


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
