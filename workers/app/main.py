import io
import json
import logging
import os
import sys

from arq import create_pool
from arq.connections import RedisSettings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("zapcards-workers")

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/zapcards")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "")
S3_BUCKET = os.environ.get("S3_BUCKET", "zapcards-files")
S3_ACCESS_KEY = os.environ.get("S3_ACCESS_KEY", "")
S3_SECRET_KEY = os.environ.get("S3_SECRET_KEY", "")
S3_REGION = os.environ.get("S3_REGION", "auto")
CHUNK_SIZE = int(os.environ.get("CHUNK_SIZE", "500"))
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-m3")

ARQ_SETTINGS = RedisSettings.from_dsn(REDIS_URL)


def get_file(key: str) -> bytes | None:
    if S3_ENDPOINT:
        import boto3
        s3 = boto3.client(
            "s3",
            endpoint_url=S3_ENDPOINT,
            aws_access_key_id=S3_ACCESS_KEY,
            aws_secret_access_key=S3_SECRET_KEY,
            region_name=S3_REGION,
        )
        try:
            obj = s3.get_object(Bucket=S3_BUCKET, Key=key)
            return obj["Body"].read()
        except Exception as e:
            logger.error("S3 get failed: %s", e)
            return None
    else:
        filepath = os.path.join("./uploads", key)
        if os.path.exists(filepath):
            with open(filepath, "rb") as f:
                return f.read()
        return None


async def update_note_content(ctx, note_id: str, content: str):
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession, create_async_engine

    engine = create_async_engine(DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        await db.execute(
            text("UPDATE notes SET content_md = :content WHERE id = CAST(:id AS uuid)"),
            {"content": content, "id": note_id},
        )
        await db.commit()
    await engine.dispose()

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

    client = Groq(api_key=GROQ_API_KEY)
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
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession, create_async_engine
    from sentence_transformers import SentenceTransformer

    engine = create_async_engine(DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    model = SentenceTransformer(EMBEDDING_MODEL)

    async with session_factory() as db:
        result = await db.execute(text("SELECT content_md FROM notes WHERE id = CAST(:id AS uuid)"), {"id": note_id})
        row = result.fetchone()
        if not row or not row[0]:
            await engine.dispose()
            return

        content = row[0]

        await db.execute(text("DELETE FROM note_chunks WHERE note_id = CAST(:id AS uuid)"), {"id": note_id})

        words = content.split()
        embed_data = []
        for i in range(0, len(words), CHUNK_SIZE):
            chunk_text = " ".join(words[i : i + CHUNK_SIZE])
            if chunk_text.strip():
                embed_data.append(chunk_text)

        if embed_data:
            embeddings = model.encode(embed_data).tolist()
            for chunk_text, emb in zip(embed_data, embeddings):
                await db.execute(
                    text("INSERT INTO note_chunks (note_id, content, embedding) VALUES (CAST(:nid AS uuid), :content, :emb::vector)"),
                    {"nid": note_id, "content": chunk_text, "emb": json.dumps(emb)},
                )
            await db.commit()
            logger.info("Generated %d embeddings for note %s", len(embed_data), note_id)

    await engine.dispose()


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
