import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.redis import get_redis, get_redis_settings_safe
from app.models.user import User
from app.schemas.chat import ImportResult
from app.services.auth import get_required_user
from app.services.ingest import ingest_file

logger = logging.getLogger(__name__)
router = APIRouter()

JOB_MAP = {
    "ocr": "process_ocr",
    "pdf": "process_pdf",
    "docx": "process_pdf",
    "csv": "process_pdf",
    "audio": "process_audio",
    "video": "process_audio",
}


@router.post("", response_model=ImportResult, status_code=202)
async def import_file(
    file: UploadFile,
    area: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_required_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Arquivo sem nome")

    note = await ingest_file(file, area, db, user_id=user.id)

    job_name = JOB_MAP.get(note.source_type)
    if job_name:
        try:
            pool = await get_redis()
            await pool.enqueue_job(job_name, str(note.id), note.source_file)
            logger.info("Enqueued %s job for note %s", job_name, note.id)
        except Exception as e:
            logger.warning("Could not enqueue worker job %s: %s", job_name, e)

    return ImportResult(note_id=str(note.id), title=note.title, source_type=note.source_type)
