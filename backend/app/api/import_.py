import asyncio
import logging

from arq import create_pool
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.redis import ARQ_SETTINGS
from app.schemas.chat import ImportResult
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
async def import_file(file: UploadFile, area: str = "", db: AsyncSession = Depends(get_db)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Arquivo sem nome")

    note = await ingest_file(file, area, db)

    job_name = JOB_MAP.get(note.source_type)
    if job_name:
        try:
            pool = await create_pool(ARQ_SETTINGS)
            await pool.enqueue_job(job_name, str(note.id), note.source_file)
            await asyncio.sleep(0.1)
            await pool.close()
            logger.info("Enqueued %s job for note %s (file %s)", job_name, note.id, note.source_file)
        except Exception as e:
            logger.warning("Could not enqueue worker job %s: %s", job_name, e)

    return ImportResult(note_id=str(note.id), title=note.title, source_type=note.source_type)
