from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.note import Note
from app.schemas.chat import ImportResult
from app.services.ingest import ingest_file

router = APIRouter()


@router.post("", response_model=ImportResult, status_code=202)
async def import_file(file: UploadFile, area: str = "", db: AsyncSession = Depends(get_db)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Arquivo sem nome")

    note = await ingest_file(file, area, db)
    return ImportResult(note_id=str(note.id), title=note.title, source_type=note.source_type)
