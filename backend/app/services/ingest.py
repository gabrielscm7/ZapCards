import logging
import os
import tempfile
import uuid
from pathlib import Path

from botocore.exceptions import ClientError, EndpointConnectionError
from fastapi import HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.s3 import get_s3_client, get_s3_public_url
from app.core.config import settings
from app.models.note import Note

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".webp",
    ".pdf", ".doc", ".docx", ".csv",
    ".mp3", ".wav", ".ogg", ".mp4", ".webm", ".mov",
}

EXTENSION_TO_TYPE = {
    ".jpg": "ocr", ".jpeg": "ocr", ".png": "ocr", ".webp": "ocr",
    ".pdf": "pdf", ".doc": "docx", ".docx": "docx", ".csv": "csv",
    ".mp3": "audio", ".wav": "audio", ".ogg": "audio",
    ".mp4": "video", ".webm": "video", ".mov": "video",
}


async def ingest_file(file: UploadFile, area: str, db: AsyncSession) -> Note:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Formato nao suportado: {ext}")

    file_key = f"uploads/{uuid.uuid4()}{ext}"
    content = await file.read()

    s3 = get_s3_client()
    try:
        s3.put_object(Bucket=settings.S3_BUCKET, Key=file_key, Body=content)
    except (ClientError, EndpointConnectionError) as e:
        logger.error("S3 upload failed: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Servico de armazenamento indisponivel. Verifique a configuracao S3_ENDPOINT.",
        )

    source_type = EXTENSION_TO_TYPE.get(ext, "text")
    title = Path(file.filename or "nota").stem
    markdown = f"[Arquivo importado: {get_s3_public_url(file_key)}]\n\nProcessando..."

    note = Note(
        title=title,
        content_md=markdown,
        area=area,
        source_type=source_type,
        source_file=file_key,
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)

    return note
