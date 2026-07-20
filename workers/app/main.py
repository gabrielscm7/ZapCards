from arq import create_pool
from arq.connections import RedisSettings

from app.core.config import settings

ARQ_SETTINGS = RedisSettings.from_dsn(settings.REDIS_URL)


async def process_ocr(ctx, note_id: str, file_key: str):
    import io, json
    import boto3
    from app.core.config import settings as s
    from app.models.note import Note
    from PIL import Image
    import pytesseract

    s3 = boto3.client("s3", endpoint_url=s.S3_ENDPOINT or None,
                      aws_access_key_id=s.S3_ACCESS_KEY, aws_secret_access_key=s.S3_SECRET_KEY)

    obj = s3.get_object(Bucket=s.S3_BUCKET, Key=file_key)
    img = Image.open(obj["Body"])
    text = pytesseract.image_to_string(img, lang="por+eng")

    async with create_pool(ARQ_SETTINGS) as pool:
        await pool.enqueue_job("update_note_content", note_id, text)


async def process_pdf(ctx, note_id: str, file_key: str):
    import io, boto3
    from markitdown import MarkItDown
    from app.core.config import settings as s

    s3 = boto3.client("s3", endpoint_url=s.S3_ENDPOINT or None,
                      aws_access_key_id=s.S3_ACCESS_KEY, aws_secret_access_key=s.S3_SECRET_KEY)

    obj = s3.get_object(Bucket=s.S3_BUCKET, Key=file_key)
    md = MarkItDown()
    result = md.convert(io.BytesIO(obj["Body"].read()), file_extension=".pdf")

    async with create_pool(ARQ_SETTINGS) as pool:
        await pool.enqueue_job("update_note_content", note_id, result.text_content)


async def process_audio(ctx, note_id: str, file_key: str):
    import boto3
    from groq import Groq
    from app.core.config import settings as s

    client = Groq(api_key=s.GROQ_API_KEY)

    s3_client = boto3.client("s3", endpoint_url=s.S3_ENDPOINT or None,
                             aws_access_key_id=s.S3_ACCESS_KEY, aws_secret_access_key=s.S3_SECRET_KEY)

    obj = s3_client.get_object(Bucket=s.S3_BUCKET, Key=file_key)
    transcript = client.audio.transcriptions.create(
        model="whisper-large-v3-turbo",
        file=(file_key, obj["Body"].read()),
        response_format="text",
    )

    async with create_pool(ARQ_SETTINGS) as pool:
        await pool.enqueue_job("update_note_content", note_id, transcript)


async def generate_embeddings(ctx, note_id: str):
    from sqlalchemy import select
    from app.core.database import async_session, engine
    from app.models.note import Note, NoteChunk
    from app.services.embed import embed_texts
    from app.core.config import settings as s

    async with async_session() as db:
        result = await db.execute(select(Note).where(Note.id == note_id))
        note = result.scalar_one_or_none()
        if not note:
            return

        await db.execute(
            select(NoteChunk).where(NoteChunk.note_id == note_id).delete()
        )

        content = note.content_md
        words = content.split()
        chunks = []
        for i in range(0, len(words), s.CHUNK_SIZE):
            chunk = " ".join(words[i:i + s.CHUNK_SIZE])
            if chunk.strip():
                chunks.append(NoteChunk(note_id=note_id, content=chunk))

        if chunks:
            embeddings = await embed_texts([c.content for c in chunks])
            for c, emb in zip(chunks, embeddings):
                c.embedding = emb
            db.add_all(chunks)
            await db.commit()


async def update_note_content(ctx, note_id: str, content: str):
    from sqlalchemy import update
    from app.core.database import async_session
    from app.models.note import Note

    async with async_session() as db:
        await db.execute(update(Note).where(Note.id == note_id).values(content_md=content))
        await db.commit()

    await ctx["redis"].enqueue_job("generate_embeddings", note_id)


class WorkerSettings:
    functions = [process_ocr, process_pdf, process_audio, generate_embeddings, update_note_content]
    redis_settings = ARQ_SETTINGS
    max_jobs = 10
